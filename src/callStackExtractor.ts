import * as vscode from "vscode";
import { SQLStatement } from "./models/SQLStatement";
import { CallStackLine, LineType } from "./models/CallStack"; // Enum to identify type of line

var fs = require("fs");
var path = require("path");
var es = require("event-stream");

// var settings: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(
//   "peoplesoft-tools"
// );

// TODO: Consider moving this into models
// Define a list of global regexes that can be passed around functions for performance reasons
type regexType = {
  constructorCallsToRemove: string;
};

var regexesToUse: regexType = {
  constructorCallsToRemove: ""
};

module.exports = {
  findValue(o: any, value: any) {
    for (var prop in o) {
      if (o.hasOwnProperty(prop) && o[prop] === value) {
        return prop;
      }
    }
    return null;
  },
  getStats(filePath: string): Promise<any> {
    return new Promise<any>((resolve, reject) => {
      //console.time("getStats");
      var sessionNos: number[] = [];
      var lowestNestValue: number = -1;

      var s = fs
        .createReadStream(filePath)
        .pipe(es.split())
        .pipe(
          es
            .mapSync(function (line: string) {
              // pause the readstream
              s.pause();

              // process line here and call s.resume() when rdy

              // Session number logic - START
              let quoteMatchResult = /PSAPPSRV.\d+\s+\((\d+)\)/gi.exec(line);

              let sessionNo: number;
              quoteMatchResult && quoteMatchResult.length > 0
                ? (sessionNo = parseInt(quoteMatchResult[1]))
                : null;

              // add session number to array if it doesn't already exist
              if (sessionNo) {
                sessionNos.includes(sessionNo)
                  ? null
                  : sessionNos.push(sessionNo);
              }

              // Session number logic - END

              // lowest nest value logic - START
              let lowestNestValueResult = /Nest=(\d+)/.exec(line);
              if (lowestNestValueResult && lowestNestValueResult.length > 0) {
                let currentNestValue = parseInt(lowestNestValueResult[1]);
                if (lowestNestValue == -1) lowestNestValue = currentNestValue;
                else if (lowestNestValue > currentNestValue) {
                  lowestNestValue = currentNestValue;
                }
              }

              // lowest nest value logic - END

              // resume the readstream, possibly from a callback
              s.resume();
            })
            .on("error", function (err: string) {
              console.log(err);
              reject([]);
            })
            .on("end", function () {
              resolve({ sessionNos, lowestNestValue });
            })
        );

      //console.timeEnd("getStats");
    });
  },
  // This method can be called per session if there are any
  extractCallStackHelper(
    fileContents: string,
    statistics: any,
    sessionNo: number,
    progress: vscode.Progress<{ message?: string; increment?: number }>
  ) {
    // Grab only the lines that we are interested in, removing header junk for each of the lines

    //console.time(`session ${sessionNo} - extract lines`);
    let regexesLinestoFind = [
      /(?:(?:start|end|resume|reend).*Nest=.*)/, // Match on start/end/resume/reend
      /(?:call (?:int|private|method|getter|setter|constructor).*)/, // Match on call int, call private, call method, call getter and call setter
      /(?:Dur=.*COM Stmt=.*)/, // Match SQL
      /(?:Dur=\d+\.\d+\sBind-\d+.*)/, // Match SQL Binds
      /return stack:.*/ // Match on returns
      // Update: Looks like we no longer need to search for any enders. We can just use "return stack:" instead. This seems to be more accurate, especially in the case of constructors calling other methods.
      // , /End-Function.*|end-get.*|end-set.*|end-method.*/
    ]
      .map(r => r.source)
      .join("|");
    regexesLinestoFind = `(?:${regexesLinestoFind})`;

    let lines: RegExpMatchArray = fileContents.match(
      new RegExp(regexesLinestoFind, "gm")
    );

    // let intermediateTraceFile = "C:\\temp\\intermediateFile.tracesql"

    // let intermediateFileContents: string = "";
    // lines.forEach(lineContents => {
    //   intermediateFileContents += `${lineContents}\n`;
    // });
    // let newFileStream = fs.createWriteStream("${intermediateTraceFile}")
    // newFileStream.write(`${intermediateFileContents}`);
    // newFileStream.end();

    //console.timeEnd(`session ${sessionNo} - extract lines`);
    progress.report({ increment: 20, message: "Extracted lines" });

    // Get the lowest nest value
    let lowestNestValue: number = statistics.lowestNestValue;

    let totalSessionDuration: number = 0;

    // reset fileContents since it is now stored in lines
    fileContents = "";

    let prevNestLevel: number = 0;
    let nestLevel: number = 0;

    // startContext will store a list of contexts to keep track of all the start and start-ext calls
    let startContext: {
      line: number;
      text: string;
      nest: number;
      dur: string;
    }[] = [];

    // resumeContext will store a list of contexts to keep track of all the resume calls
    let resumeContext: {
      line: number;
      text: string;
      nest: number;
      dur: string;
    }[] = [];

    let lastCall: string = "";
    let previousNonSqlCall: CallStackLine;

    // perform initial formatting based on Nest value
    let callStack: CallStackLine[] = [];

    let SQLStatements: Map<number, SQLStatement> = new Map<
      number,
      SQLStatement
    >(); // Contains all the SQLStatements in the file along with their bind variables
    let currentSQLStatement: SQLStatement;

    function cleanLine(currentCall: CallStackLine, previousNonSqlCall: CallStackLine) {
      let line = currentCall.text;
      let prefix = line.substring(0, 4);

      switch (prefix) {
        case "star":
          // Remove Nest from each line since we no longer need it
          line = line.replace(/\s+Nest=\d+/g, "");

          // Some may not have a duration
          // e.g. start-ext isSaveWarning PT_NAV2.NavOptions.OnExecute getter
          // becomes call getter isSaveWarning PT_NAV2.NavOptions.OnExecute
          line = line.replace(
            /start-ext\s(\w+)\s(.*)\s(constructor|method|getter|setter)/gm,
            "call $3 $1 $2"
          );

          if ((previousNonSqlCall != undefined) && (previousNonSqlCall.text == line) && (previousNonSqlCall.nest == currentCall.nest)) {
            // This is a repeated line and should be removed
            line = "";
            // We need to associate the other call line number with this one so that we can ultimately get the duration
            previousNonSqlCall.line_number = currentCall.line_number;

          } else {

            line = line.replace(
              /start-ext\s(\w+)\s(\w+\.\w+\.\w+)/gm,
              "call function $1 $2"
            );

            // This line is here as a workaround to fix a regex crashing issue
            if (line.includes(".OnExecute")) {
              line = line.replace("call function", "call method");
            }

            // Rename CI functions
            line = line.replace(
              /start-ext\s(\w+)\s(\w+\.\w+)$/gm,
              "call function $1 $2"
            );

            // Remove .OnExecute
            line = line.replace(/.OnExecute/gm, "");
          }
          break;

        case "call":
          if (line.substring(0, 4) == "call") {
            // Remove unnecessary trailer junk (e.g. params= or #params=)
            line = line.replace(/[\s]#?params=\d+/g, "");

            // Prefix all calls with suffix .OnExecute (apart from getter, setter and app engine steps) with call method
            line = line.replace(
              /call\s(?!(?:getter|setter))(.*\.OnExecute)$/gm,
              "call method $1"
            );

            // Prefix all remaining calls with call function
            line = line.replace(
              /call\s(?!(?:method|getter|setter|constructor|SQL))(.*(?!\.OnExecute))$/gm,
              "call function $1"
            );

            // Rename eligible call methods to call constructors
            line = line.replace(
              /call\smethod\s+(\w+)(\s.*\1).OnExecute/gm,
              "call constructor $1$2"
            );

            line = line.replace(
              new RegExp(regexesToUse.constructorCallsToRemove, "gm"),
              ""
            );

            // Replace any call constructors with the constructor name at the start
            // e.g. call constructor SCC_FLUID:UTIL:CSSClass
            // becomes call constructor CSSClass SCC_FLUID:UTIL:CSSClass
            line = line.replace(
              /call constructor\s(.*:)(\w+)/gm,
              "call constructor $2 $1$2"
            );

            // Remove .OnExecute
            line = line.replace(/.OnExecute/gm, "");

            // Replace any colons with dots (unless they are followed by a digit since that would be a SQL bind variable)
            line = line.replace(/:(?!\d)/gm, ".");
            break;
          }
        case "resu":
          // Remove Nest and following dot from resume line since we don't need it
          line = line.replace(/\s+Nest=\d+(?:\s\.)?/g, "");
          break;
      }

      currentCall.text = line;
    }

    if (lines) {
      //console.time(`session ${sessionNo} - process each line for session`);
      let lineNo = 1;
      let lineType: LineType;

      // for each line

      lines.forEach(lineContents => {
        try {
          let lineMatchResult = /(start-ext|start|end-ext|end|resume|reend)\s+Nest=(\d+)/.exec(
            lineContents
          );
          //console.time(`Processing line ${lineNo}`)

          let duration: string = "";
          let actualNestLevel: number = 0;

          // if we have matched a start-ext, start, end-ext, end, resume or reend
          if (lineMatchResult && lineMatchResult.length > 0) {
            prevNestLevel = nestLevel;
            actualNestLevel = parseInt(lineMatchResult[2]);
            nestLevel = parseInt(lineMatchResult[2]) - lowestNestValue;

            // Always ensure that the next nest level is only indented by 1 tab, and not more
            if (nestLevel - prevNestLevel > 1) {
              nestLevel = prevNestLevel + 1;
            }

            let matchArray: RegExpMatchArray = [];

            switch (lineMatchResult[1]) {
              case "start":
                lineType = LineType.Start;
                lastCall = "start";
                // E.g. >>> start     Nest=12  DERIVED_ADDR.ADDRESSLONG.RowInit
                matchArray = lineContents.match(
                  /start\s+Nest=(?:\d+).*?((?:\w+\.?)+)/
                );
                startContext.push({
                  line: lineNo,
                  text: matchArray[1],
                  nest: nestLevel,
                  dur: ""
                });

                break;

              case "start-ext":
                lineType = LineType.Start_ext;
                lastCall = "start";
                // keep track of start-ext location so that we can append the location to call private and call int lines
                // E.g. >>> start-ext Nest=14 ActivePrograms_SCT SSR_STUDENT_RECORDS.SR_StudentData.StudentActivePrograms.OnExecute
                matchArray = lineContents.match(
                  /start-ext\s+Nest=(?:\d+)\s+\w+\s+((?:\w+\.?)+)/
                );

                startContext.push({
                  line: lineNo,
                  text: matchArray[1],
                  nest: nestLevel,
                  dur: ""
                });
                break;

              case "resume":
                lineType = LineType.Resume;
                lastCall = "resume";
                matchArray = lineContents.match(
                  /resume\s+Nest=(?:\d+)\s*\.?\s*((?:\w+\.?)+)/
                );

                resumeContext.push({
                  line: lineNo,
                  text: matchArray[1],
                  nest: nestLevel,
                  dur: ""
                });
                break;

              case "end-ext":
                lineType = LineType.End_ext;
                // E.g. <<< end-ext   Nest=08 CheckForMultipleInstitutionCareer SAA_ACADEMIC_PROGRESS_FL.UTIL.Common.OnExecute Dur=0.013742 CPU=0.000000 Cycles=81
                lastCall = "end";
                duration = lineContents.match(/Dur=(\d+.\d+)/)[1];

                // We wil use the duration from the end-ext and store it on the start/start-ext call
                // This means we have to find the associated start-ext by comparing nest levels
                for (let i = startContext.length; --i >= 0;) {
                  if (startContext[i].nest == nestLevel) {

                    startContext[i].dur = duration;
                    let callStackLineNo: number = 0;

                    for (let j = callStack.length; --j >= 0;) {
                      if (startContext[i].line == callStack[j].line_number) {
                        callStackLineNo = j;
                        break;
                      }
                    }
                    callStack[callStackLineNo].dur = duration;
                    break;
                  }
                }
                // remove the last element from startContext
                startContext.pop();
                break;
              case "end":
                lineType = LineType.End;
                // E.g <<< end       Nest=06  PT_AG_LAYOUT.PT_AG_GROUPBOX7.RowInit Dur=0.000401 CPU=0.000000 Cycles=8
                lastCall = "end";
                duration = lineContents.match(/Dur=(\d+.\d+)/)[1];
                duration

                for (let i = startContext.length; --i >= 0;) {
                  if (startContext[i].nest == nestLevel) {
                    // We wil use the duration from the end-ext and store it on the start
                    startContext[i].dur = duration;
                    let callStackLineNo: number = 0;

                    for (let j = callStack.length; --j >= 0;) {
                      if (startContext[i].line == callStack[j].line_number) {
                        callStackLineNo = j;
                        break;
                      }
                    }
                    callStack[callStackLineNo].dur = duration;
                    break;
                  }
                }
                // remove the last element from startContext
                startContext.pop();
                break;
              case "reend":
                lineType = LineType.Reend;
                lastCall = "reend";
                resumeContext.pop();
                break;
              default:
                break;
            }
          } else {
            // we haven't matched a start-ext, start, end-ext, end, resume or rend
            // look for calls to other methods/functions, or other enders
            // lineMatchResult = /(call (int|setter|getter|private|method)|End-Function|end-get|end-set|end-method|%s)/.exec(
            lineMatchResult = /(call (int|setter|getter|private|method|constructor)|return stack:|(COM Stmt=)|(Bind)-)/.exec(
              lineContents
            );

            // if we have found a match to calls to other methods/functions or other enders
            if (lineMatchResult && lineMatchResult.length > 0) {
              // if the last call was a start or a call then increment the nest level
              if (
                lastCall == "start" ||
                lastCall == "resume" ||
                (lastCall.slice(0, 4) == "call" &&
                  lastCall != "callConstructor" &&
                  lastCall != "callSQL" &&
                  lastCall != "SQLBind")
              ) {
                nestLevel += 1;
                actualNestLevel += 1;
              }

              switch (lineMatchResult[1]) {
                case "COM Stmt=":
                  lineType = LineType.Sql;
                  // SQL Statement
                  lastCall = "callSQL";
                  currentSQLStatement = new SQLStatement();
                  currentSQLStatement.line_number = lineNo;
                  currentSQLStatement.text = lineContents.match(
                    /COM Stmt=(.*)/
                  )[1];
                  currentSQLStatement.duration = lineContents.match(
                    /Dur=(\d+.\d+)/
                  )[1];

                  duration = currentSQLStatement.duration;
                  SQLStatements.set(lineNo, currentSQLStatement);
                  lineContents = `call SQL ${currentSQLStatement.text.trim()}`;
                  break;
                case "Bind-":
                  // SQL Bind
                  lineType = LineType.SqlBind;
                  lastCall = "SQLBind";
                  let matchResults = lineContents.match(
                    /Bind-(\d+)\stype=(\d+)\slength=(\d+)\svalue=(.*)$/
                  );

                  if (matchResults != undefined) {
                    // Note: currentSQLStatement is passed by reference so it'll also change the value in SQLStatements
                    currentSQLStatement.addBind(
                      parseInt(matchResults[1]),
                      parseInt(matchResults[2]),
                      parseInt(matchResults[3]),
                      matchResults[4]
                    );
                  }
                  break;
                case "call method":
                  lineType = LineType.Method;
                  lastCall = "callMethod";
                  // Re-arrange the line so that the call is at the start (like all other lines)
                  lineContents = lineContents.replace(
                    /call method\s+((?:\w+:?)+)\.(\w+)/,
                    "call $2 $1.OnExecute"
                  );
                  break;
                case "call getter":
                  lineType = LineType.Getter;
                  lastCall = "callGetter";
                  // Re-arrange the line so that the call is at the start (like all other lines)
                  lineContents = lineContents.replace(
                    /call getter\s+((?:\w+:?)+)\.(\w+)/,
                    "call getter $2 $1.OnExecute"
                  );
                  break;

                case "call setter":
                  lineType = LineType.Setter;
                  lastCall = "callSetter";
                  // Remove extra space after call setter and also rearrange setter so that it is at the start (like all other lines)
                  // E.g. call setter  EO:CA:Address.EditPageHeader
                  lineContents = lineContents.replace(
                    /call setter\s+((?:\w+:?)+)\.(\w+)/,
                    "call setter $2 $1.OnExecute"
                  );
                  break;

                case "call private":
                  lineType = LineType.Method;
                  lastCall = "callPrivate";
                  // Now we need to append the last value in startContext (i.e. )
                  if (startContext.length > 0) {
                    lineContents = lineContents.replace(
                      /call private\s+(\w+)/gm,
                      `call $1 ${startContext[startContext.length - 1].text}`
                    );
                  }
                  break;

                case "call int":
                  lineType = LineType.Function;
                  lastCall = "callInt";
                  // Now we need to append the last value in startContext (i.e. )
                  if (startContext.length > 0) {
                    lineContents = lineContents.replace(
                      /call int\s+(\w+)/gm,
                      `call $1 ${startContext[startContext.length - 1].text}`
                    );
                  }
                  break;
                case "call constructor":
                  lineType = LineType.Function;
                  lastCall = "callConstructor";
                  // Note: If it's a call constructor in this context then we know that this is standalone and no other nested calls will be made
                  break;
                case "return stack:":
                  lineType = undefined;
                  lastCall = "endSomething";
                  nestLevel -= 1;
                  break;

                default:
                  break;
              }
            }
          } // end - if we have matched a start-ext, start, end-ext, end, resume or reend

          // There are two scenarios that we want to add duration
          // (1) It's a SQL line, and there have never been any previous non-sql calls before it. In these cases there will be no nest values to derive the actual nest level
          // (2) The actual nest level is the lowest value
          if ((actualNestLevel == lowestNestValue) || ((lineType == LineType.Sql) && (previousNonSqlCall == undefined))) {
            if (duration != "") {
              totalSessionDuration += parseFloat(duration);
            }
          }

          let currentCall = {
            line_number: lineNo,
            type: lineType,
            text: lineContents,
            nest: nestLevel,
            dur: duration
          }

          cleanLine(currentCall, previousNonSqlCall); // Cleans up the line number

          if (lineMatchResult[1] != "Bind-" && currentCall.text != "") {
            callStack.push(currentCall);
          }

          // We only need the previous non-sql call for an edge case that rarely happens (see ProcessReport example)
          if (lineType != LineType.Sql && lineType != LineType.SqlBind) {
            previousNonSqlCall = currentCall;
          }

          //console.timeEnd(`Processing line ${lineNo}`)
          lineNo += 1;
        } catch (err) {
          console.log(`Line ${lineNo} - ${err}`);
        }
      }); // end - for each line

      progress.report({
        increment: 40 / statistics.sessionNos.length,
        message: `Extracted session ${sessionNo}`
      });
      //console.timeEnd(`session ${sessionNo} - process each line for session`);
    } //end - perform initial formatting of callstack based on Nest value

    statistics.sessionDuration = totalSessionDuration;

    // Now that we have all the information print out call stack with tabs
    callStack.forEach(line => {
      // Always have an indent so that you can collapse an entire session
      let tabs: string = "\t";

      for (let startIndex = 0; startIndex < line.nest; startIndex++) {
        tabs += "\t";
      }

      line.text = `${tabs}${line.text}`;

      switch (line.type) {
        case LineType.Sql:
          let sqlStatement: SQLStatement = SQLStatements.get(line.line_number);
          let bindText: string = `${tabs}\tSQL Binds - `;
          sqlStatement.binds.forEach((bind, index, binds) => {
            switch (bind.type) {
              case 6: // number
                break;
              default:
                bind.value = `'${bind.value}'`; // everything else should be surrounded in single quotes
            }

            if (index != binds.length - 1) {
              bindText += `:${bind.number} = ${bind.value},\t`;
            } else {
              // We're on the last bind, so don't add a comma or tab
              bindText += `:${bind.number} = ${bind.value}`;
            }
          });
          fileContents += `${line.text} [Dur=${line.dur}]\n`;
          if (sqlStatement.binds.length > 0) {
            fileContents += `${bindText}\n`;
          }
          break;
        default:
          if (line.dur != "") {
            fileContents += `${line.text} [Dur=${line.dur}]\n`;
          } else {
            fileContents += `${line.text}\n`;
          }
      }
    });

    // Clean lines
    // Remove the end-ext, End-Function, end-method, end and reend calls, since we no longer need them
    //console.time(`session ${sessionNo} - remove end calls`);
    let cleaned_lines: RegExpMatchArray = fileContents.match(
      /(?:.*(?:start|resume).*)|.*(?:call\s.*).*|.*(?:SQL Binds).*/gm
    );
    // if there lines in this session, store it in fileContents
    cleaned_lines != null ? (fileContents = cleaned_lines.join("\n")) : null;
    //console.timeEnd(`session ${sessionNo} - remove end calls`);

    return fileContents;
  },
  extractCallStackWrapper(
    filePath: string,
    progress: vscode.Progress<{ message?: string; increment?: number }>
  ): Promise<string> {
    return new Promise<string>(resolve => {
      // callStack will contain the final call stack
      let callStack: string = "";

      let filePathDir = path.dirname(filePath);
      let fileNameWithoutExtension = path.basename(
        filePath,
        path.extname(filePath)
      );

      // This is the path to the file that we'll return
      let callStackFilePath: string = `${filePathDir}\\${fileNameWithoutExtension}.pcstack`;

      var newFileStream;

      let fileContents: string = fs.readFileSync(filePath, "UTF-8");
      progress.report({ increment: 5, message: "Read trace file into memory" });

      // Start timer to see how long the extract takes
      //console.time("Total Processing Time");

      // Start timer to see how long the initial filtering takes
      //console.time("Initial filter time - Total");

      let newString: string;
      // regex: call constructor\s+(.*)\s+#params=
      // Find all call constructors that have #params in them, since they will have a duplicate call constructor line that we must delete:
      // For example:
      // PSAPPSRV.4164 (411) 	 1-8101   14.25.53    0.000000                                 32:    &oReport = create SSR_TRANSCRIPT:Report();
      // PSAPPSRV.4164 (411) 	 1-8102   14.25.53    0.000000                                     call constructor SSR_TRANSCRIPT:Report
      // PSAPPSRV.4164 (411) 	 1-8103   14.25.53    0.000000                                     call constructor  SSR_TRANSCRIPT:Report #params=0
      // PSAPPSRV.4164 (411) 	 1-8104   14.25.53    0.000000   >>> start-ext Nest=82 Report SSR_TRANSCRIPT.Report.OnExecute
      // PSAPPSRV.4164 (411) 	 1-8105   14.25.53    0.000000                               >>>>> Begin SSR_TRANSCRIPT.Report.OnExecute level 0 row 0
      //console.time("Initial filter time - Find constructor lines to remove");
      let constructorLinestoRemoveRegex: string[] = [];
      let regexp = /call constructor\s+(.*)\s+#params=/g;
      let match = regexp.exec(fileContents);

      while (match != null) {
        constructorLinestoRemoveRegex.push(
          `(?:.*call\\s+constructor\\s+${match[1]})`
        );
        match = regexp.exec(fileContents);
      }

      constructorLinestoRemoveRegex = [
        ...new Set(constructorLinestoRemoveRegex)
      ]; // Make array unique

      //console.timeEnd("Initial filter time - Find constructor lines to remove");

      // First remove all lines that have a call getter, call setter, call method or call constructor followed by a start-ext, since the start-ext is sufficient
      // For example: the following call method line will be ignored since there is a start-ext immediately after it:
      // PSAPPSRV.4556 (2426)   1-8760   14.05.07    0.000000       call method  SSF_CFS:SSF_CFQKey.SSFQKeyString #params=7
      // PSAPPSRV.4556 (2426)   1-8761   14.05.07    0.000000   >>> start-ext Nest=01 SSFQKeyString SSF_CFS.SSF_CFQKey.OnExecute getter
      // Example 2: the following call constructor line will be ignored since there is a start-ext immediately after it:
      // PSAPPSRV.146732 (3396) 	 1-3050250 15.11.25    0.000000                               call constructor  SAA_ACADEMIC_PROGRESS_FL:COMPONENTS:SAA_ACD_PRG_SM_FL #params=0
      // PSAPPSRV.146732 (3396) 	 1-3050251 15.11.25    0.000000   >>> start-ext Nest=07 SAA_ACD_PRG_SM_FL SAA_ACADEMIC_PROGRESS_FL.COMPONENTS.SAA_ACD_PRG_SM_FL.OnExecute
      //console.time(
      // "Initial filter time - call getter/setter/method/constructor"
      // );
      newString = fileContents.replace(
        /(?:.*call\s+(getter|setter|method|constructor).*)\r?\n(.*>>>\sstart-ext.*)/gm,
        "$2 $1"
      );
      //console.timeEnd("Initial filter time - call getter/setter/method/constructor");

      // Note: Sometimes there are call methods that get missed due to weird call stacks. For example:
      // PSAPPSRV.30944 (8455) 	 1-7950   13.02.08    0.000000                                   call method  PSXP_RPTDEFNMANAGER:ReportDefn.ProcessReport #params=6
      // PSAPPSRV.30944 (8455) 	 1-7951   13.02.08    0.004000 Cur#2.30944.notSamTran RC=0 Dur=0.000000 Open Cursor Handle=0000020A13144038
      // PSAPPSRV.30944 (8455) 	 1-7952   13.02.08    0.000000 Cur#2.30944.DEMODB RC=0 Dur=0.000000 COM Stmt=SELECT VERSION FROM PSVERSION WHERE OBJECTTYPENAME = 'SYS'
      // PSAPPSRV.30944 (8455) 	 1-7953   13.02.08    0.001000 Cur#2.30944.DEMODB RC=0 Dur=0.000000 Fetch
      // PSAPPSRV.30944 (8455) 	 1-7954   13.02.08    0.000000 Cur#2.30944.DEMODB RC=0 Dur=0.000000 COM Stmt=SELECT OBJECTID1,OBJECTVALUE1, OBJECTID2,OBJECTVALUE2, OBJECTID3,OBJECTVALUE3, OBJECTID4,OBJECTVALUE4, OBJECTID5,OBJECTVALUE5, OBJECTID6,OBJECTVALUE6, OBJECTID7,OBJECTVALUE7  FROM PSPCMPROG WHERE OBJECTID1 = :1 AND OBJECTVALUE1 = :2 ORDER BY OBJECTID1,OBJECTVALUE1, OBJECTID2,OBJECTVALUE2, OBJECTID3,OBJECTVALUE3, OBJECTID4,OBJECTVALUE4, OBJECTID5,OBJECTVALUE5, OBJECTID6,OBJECTVALUE6, OBJECTID7,OBJECTVALUE7
      // PSAPPSRV.30944 (8455) 	 1-7955   13.02.08    0.000000 Cur#2.30944.DEMODB RC=0 Dur=0.000000 Bind-1 type=8 length=4 value=104
      // PSAPPSRV.30944 (8455) 	 1-7956   13.02.08    0.000000 Cur#2.30944.DEMODB RC=0 Dur=0.000000 Bind-2 type=2 length=28 value=PT_SECURITY_DIGITALCERTSTORE
      // PSAPPSRV.30944 (8455) 	 1-7957   13.02.08    0.001000 Cur#2.30944.DEMODB RC=0 Dur=0.000000 Fetch
      // PSAPPSRV.30944 (8455) 	 1-7958   13.02.08    0.000000 Cur#2.30944.DEMODB RC=0 Dur=0.000000 Fetch
      // PSAPPSRV.30944 (8455) 	 1-7959   13.02.08    0.000000 Cur#2.30944.DEMODB RC=1 Dur=0.000000 Fetch
      // PSAPPSRV.30944 (8455) 	 1-7960   13.02.08    0.001000 Cur#2.30944.DEMODB RC=0 Dur=0.001000 Disconnect
      // PSAPPSRV.30944 (8455) 	 1-7961   13.02.08    0.001000   >>> start-ext Nest=08 ProcessReport PSXP_RPTDEFNMANAGER.ReportDefn.OnExecute
      // PSAPPSRV.30944 (8455) 	 1-7962   13.02.08    0.000000                               >>>>> Begin PSXP_RPTDEFNMANAGER.ReportDefn.OnExecute level 0 row 0
      // PSAPPSRV.30944 (8455) 	 1-7963   13.02.08    0.002000                               1239: method ProcessReport

      // We cater for these lines (see cleanLine method) by keeping track of the previous non-sql call and then checking whether the current line and nest level are exactly the same as the previous
      // If the lines are exactly the same, we remove the second occurrence of the line from the call stack
      // call method ProcessReport PSXP_RPTDEFNMANAGER.ReportDefn
      // call SQL SELECT VERSION FROM PSVERSION WHERE OBJECTTYPENAME = 'SYS' [Dur=0.000000]
      // call SQL SELECT OBJECTID1,OBJECTVALUE1, OBJECTID2,OBJECTVALUE2, OBJECTID3,OBJECTVALUE3, OBJECTID4,OBJECTVALUE4, OBJECTID5,OBJECTVALUE5, OBJECTID6,OBJECTVALUE6, OBJECTID7,OBJECTVALUE7  FROM PSPCMPROG WHERE OBJECTID1 = :1 AND OBJECTVALUE1 = :2 ORDER BY OBJECTID1,OBJECTVALUE1, OBJECTID2,OBJECTVALUE2, OBJECTID3,OBJECTVALUE3, OBJECTID4,OBJECTVALUE4, OBJECTID5,OBJECTVALUE5, OBJECTID6,OBJECTVALUE6, OBJECTID7,OBJECTVALUE7 [Dur=0.000000]
      //   SQL Binds - :1 = '104',	:2 = 'PT_SECURITY_DIGITALCERTSTORE'
      // call method ProcessReport ReportDefn [Dur=3.450478]


      // Remove the superfluous call constructors that we identified earlier

      regexesToUse.constructorCallsToRemove = `(?:${constructorLinestoRemoveRegex.join(
        "|"
      )})`;

      //Remove unnecessary DoModals
      //console.time("Initial filter time - Do Modals time");
      newString = newString.replace(
        /(\d+:.*DoModal\(.*)([\s\S]+?EndModal[\s\S]+?)(\1)/gm,
        "$1$2"
      );
      //console.timeEnd("Initial filter time - Do Modals time");

      //console.timeEnd("Initial filter time - Total");

      progress.report({
        increment: 20,
        message: "Finished initial filter stage"
      });

      this.getStats(filePath).then((stats: any) => {
        var statistics: any = stats;
        // for each session number

        // Keep track of the number of sessions (for formatting purposes at the end)
        let sessionCount: number = 1;

        if (stats.sessionNos.length > 0) {
          /* This is a PSAPPSRV trace */
          /* sort sessionNos array */
          stats.sessionNos.sort(function (a: number, b: number) {
            return a - b;
          });
          stats.sessionNos.forEach((sessionNo: number) => {
            // Extract only those lines relating to the session number
            // console.log(`Extracting lines for sessionNo: ${sessionNo}`);
            let sessionSpecificRegex = new RegExp(
              `PSAPPSRV\\.\\d+\\s+\\(${sessionNo}\\).*`,
              "g"
            );
            let sessionSpecificString: string = newString
              .match(sessionSpecificRegex)
              .join("\n");

            sessionSpecificString = this.extractCallStackHelper(
              sessionSpecificString,
              statistics,
              sessionNo,
              progress
            );

            // if we're at the first session then format the Session text slightly different
            sessionCount == 1
              ? (callStack += `Session ${sessionNo} [Dur=${statistics.sessionDuration.toFixed(3)}]\n`)
              : (callStack += `\n\nSession ${sessionNo} [Dur=${statistics.sessionDuration.toFixed(3)}]\n`);

            // Build up entire call stack with the call stack produced for this session
            callStack += sessionSpecificString;

            // Increment session count, go to next sessionNo if available
            sessionCount += 1;

            // We now have the complete callstack for the session
          }); // end - for each session number
        } else {
          /* This is probably an AE SQL/PeopleCode Trace */
          callStack = this.extractCallStackHelper(
            newString,
            statistics,
            1,
            progress
          );
        }

        //console.time("File Write Time");
        // Write the call stack to a file
        newFileStream = fs.createWriteStream(callStackFilePath)
        newFileStream.write(`${callStack}`);
        newFileStream.end();

        //console.timeEnd("File Write Time");

        // Stop timer
        //console.timeEnd("Total Processing Time");

        // Return the promise containing the call stack file
        resolve(callStackFilePath);
      });
    });
  }
};
