// import * as vscode from "vscode";
var fs = require("fs");
var path = require("path");
var es = require("event-stream");

// var settings: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(
//   "peoplesoft-tools-tidy"
// );

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
      var sessionNos: number[] = [];
      var lowestNestValue: number = -1;

      var s = fs
        .createReadStream(filePath)
        .pipe(es.split())
        .pipe(
          es
            .mapSync(function(line: string) {
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
            .on("error", function(err: string) {
              console.log(err);
              reject([]);
            })
            .on("end", function() {
              resolve({ sessionNos, lowestNestValue });
            })
        );
    });
  },
  // This method can be called per session if there are any
  extractCallStackHelper(fileContents: string, statistics: any) {
    // Grab only the lines that we are interested in, removing header junk for each of the lines
    let lines: RegExpMatchArray = fileContents.match(
      // /(?:(?:(?:start|end|resume|reend).*Nest=.*)|(?:call (?:int|private|method|getter|setter).*)|End-Function.*|end-get.*|end-set.*|end-method.*)/gm
      // Update: Looks like we no longer need to search for any enders. We can just use "return stack:" instead. This seems to be more accurate, especially in the case of constructors calling other methods.
      /(?:(?:(?:start|end|resume|reend).*Nest=.*)|(?:call (?:int|private|method|getter|setter|constructor).*)|return stack:.*)/gm
    );
    // if there are lines in this session, store it in fileContents
    lines != null ? (fileContents = lines.join("\n")) : (fileContents = "");

    // Get the lowest nest value
    let lowestNestValue: number = statistics.lowestNestValue;

    // reset fileContents since it is now stored in lines
    fileContents = "";

    let prevNestLevel: number = 0;
    let nestLevel: number = 0;
    let nestLevelOffset: number = 0;

    // extContext will store a list of contexts to keep track of all the start and start-ext calls
    // consider renaming this to startContext???
    let extContext: string[] = [];

    // resumeContext will store a list of contexts to keep track of all the resume calls
    let resumeContext: string[] = [];

    let lastCall: string = "";

    // perform initial formatting based on Nest value
    if (lines) {
      // for each line
      lines.forEach(lineContents => {
        let lineMatchResult = /(start-ext|start|end-ext|end|resume|reend)\s+Nest=(\d+)/.exec(
          lineContents
        );

        // if we have matched a start-ext, start, end-ext, end, resume or reend
        if (lineMatchResult && lineMatchResult.length > 0) {
          prevNestLevel = nestLevel;
          nestLevel =
            nestLevelOffset + parseInt(lineMatchResult[2]) - lowestNestValue;

          // Always ensure that the next nest level is only indented by 1 tab, and not more
          if (nestLevel - prevNestLevel > 1) {
            nestLevel = prevNestLevel + 1;
          }

          if (resumeContext.length > 0)
            // The resume code already adds an extra tab, so don't need to indent here
            nestLevel -= 1;

          for (let startIndex = 0; startIndex < nestLevel; startIndex++) {
            lineContents = "\t" + lineContents;
          }

          fileContents += lineContents + "\n";

          let matchArray: RegExpMatchArray = [];

          switch (lineMatchResult[1]) {
            case "start":
              lastCall = "start";
              // E.g. >>> start     Nest=12  DERIVED_ADDR.ADDRESSLONG.RowInit
              matchArray = lineContents.match(
                /start\s+Nest=(?:\d+).*?((?:\w+\.?)+)/
              );
              extContext.push(matchArray[1]);

              break;

            case "start-ext":
              lastCall = "start";
              // keep track of start-ext location so that we can append the location to call private and call int lines
              // E.g. >>> start-ext Nest=14 ActivePrograms_SCT SSR_STUDENT_RECORDS.SR_StudentData.StudentActivePrograms.OnExecute
              matchArray = lineContents.match(
                /start-ext\s+Nest=(?:\d+)\s+\w+\s+((?:\w+\.?)+)/
              );
              extContext.push(matchArray[1]);
              break;

            case "resume":
              lastCall = "resume";
              matchArray = lineContents.match(
                /resume\s+Nest=(?:\d+)\s*\.?\s*((?:\w+\.?)+)/
              );
              resumeContext.push(matchArray[1]);
              break;

            case "end-ext":
              lastCall = "end";
              // remove the last element from extContext
              extContext.pop();
              break;
            case "end":
              lastCall = "end";
              // remove the last element from extContext
              extContext.pop();
              break;
            case "reend":
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
          lineMatchResult = /(call (int|setter|getter|private|method|constructor)|return stack:|%s)/.exec(
            lineContents
          );

          // if we have found a match to calls to other methods/functions or other enders
          if (lineMatchResult && lineMatchResult.length > 0) {
            // if the last call was a start or a call then increment the nest level
            if (
              lastCall == "start" ||
              (lastCall.slice(0, 4) == "call" && lastCall != "callConstructor")
            ) {
              nestLevel += 1;
            }

            switch (lineMatchResult[1]) {
              case "call method":
                lastCall = "callMethod";
                // Re-arrange the line so that the call is at the start (like all other lines)
                lineContents = lineContents.replace(
                  /call method\s+((?:\w+:?)+)\.(\w+)/,
                  "call $2 $1.OnExecute"
                );
                break;
              case "call getter":
                lastCall = "callGetter";
                // Re-arrange the line so that the call is at the start (like all other lines)
                lineContents = lineContents.replace(
                  /call getter\s+((?:\w+:?)+)\.(\w+)/,
                  "call getter $2 $1.OnExecute"
                );
                break;

              case "call setter":
                lastCall = "callSetter";
                // Remove extra space after call setter and also rearrange setter so that it is at the start (like all other lines)
                // E.g. call setter  EO:CA:Address.EditPageHeader
                lineContents = lineContents.replace(
                  /call setter\s+((?:\w+:?)+)\.(\w+)/,
                  "call setter $2 $1.OnExecute"
                );
                break;

              case "call private":
                lastCall = "callPrivate";
                // Now we need to append the last value in extContext (i.e. )
                if (extContext.length > 0) {
                  lineContents = lineContents.replace(
                    /call private\s+(\w+)/gm,
                    `call $1 ${extContext[extContext.length - 1]}`
                  );
                }

                break;

              case "call int":
                lastCall = "callInt";
                // Now we need to append the last value in extContext (i.e. )
                if (extContext.length > 0) {
                  lineContents = lineContents.replace(
                    /call int\s+(\w+)/gm,
                    `call $1 ${extContext[extContext.length - 1]}`
                  );
                }
                break;
              case "call constructor":
                lastCall = "callConstructor";
                // Note: If it's a call constructor in this context then we know that this is standalone and no other nested calls will be made
                break;
              case "return stack:":
                lastCall = "endSomething";
                nestLevel -= 1;
                break;

              // case "End-Function":
              //   lastCall = "endFunction";
              //   nestLevel -= 1;
              //   break;

              // case "end-get":
              //   lastCall = "endGet";
              //   nestLevel -= 1;
              //   break;

              // case "end-set":
              //   lastCall = "endSet";
              //   nestLevel -= 1;
              //   break;
              // case "end-method":
              //   lastCall = "endMethod";
              //   nestLevel -= 1;
              //   break;
              default:
                break;
            }
          }

          for (let startIndex = 0; startIndex < nestLevel; startIndex++) {
            lineContents = "\t" + lineContents;
          }

          fileContents += lineContents + "\n";
        } // end - if we have matched a start-ext, start, end-ext, end, resume or reend
      }); // end - for each line
    } //end - perform initial formatting based on Nest value

    // Remove Nest from each line since we no longer need it
    fileContents = fileContents.replace(/\s+Nest=\d+/g, "");

    // Remove unnecessary trailer junk (e.g. params= or #params=)
    fileContents = fileContents.replace(/Dur=.*/g, "");
    fileContents = fileContents.replace(/[\s]#?params=\d+/g, "");

    // Are there any resume or reend statements?
    // If so, then reformat the session specific string based on the resume and reend statements
    if (/(resume|reend)\s(.*)/.test(fileContents)) {
      // first remove any dots straight after the resume/reend (if there are any)
      fileContents = fileContents.replace(
        /(resume|reend)\s+\.\s+(.*)/g,
        "$1 $2"
      );

      // Store remaining text line by line in an object called results
      // results has a key value of the line number and the value is the actual line contents itself
      let results: string[] = fileContents.split("\n");

      let resumeResults: Map<number, string> = new Map<number, string>();
      let reendResults: Map<number, string> = new Map<number, string>();
      let endResults: Map<number, string> = new Map<number, string>();

      // Find resume, reend and end statements and store the line numbers in a map object along with the results
      // Note: lineNo starts from 0, so the lines in resumeResults, reendResults and endResults will be 1 less than they actually are
      for (let lineNo = 0; lineNo <= results.length; lineNo++) {
        let lineMatchResult = /(resume|reend|end)\s.*?((?:\w+\.?)+((?:\s(?:\w+\.?)+)?))/.exec(
          results[lineNo]
        );

        if (lineMatchResult && lineMatchResult.length > 0) {
          switch (lineMatchResult[1]) {
            case "resume":
              resumeResults.set(lineNo, lineMatchResult[2]);
              break;
            case "reend":
              reendResults.set(lineNo, lineMatchResult[2]);
              break;
            case "end":
              endResults.set(lineNo, lineMatchResult[2]);
              break;
            default:
              break;
          }
        }
      }

      // Add a tab to each line before resume until you reach an end for that event
      resumeResults.forEach(
        (resumeResultsLine: string, resumeResultsLineNo: number) => {
          // If there is actually an end within the same session, then format all lines after the end and before the resume
          // to do: provide an example to help with debugging
          // console.log(resumeResultsLineNo);
          // console.log(resumeResultsLine);
          // if we find the resumeResults line in end results it means we have an end within the same session??
          if (this.findValue(endResults, resumeResultsLine) != null) {
            // go backwards starting from resume results line number until you find an end
            for (let x = resumeResultsLineNo; x >= 0; x--) {
              let regexEndStatement = new RegExp(
                `end\\s+${resumeResultsLine}`,
                "g"
              );

              let matchEndStatementResult = regexEndStatement.exec(results[x]);

              // if there is a match, we have reached the end statement, so we don't need to add any more tabs
              if (
                matchEndStatementResult &&
                matchEndStatementResult.length > 0
              ) {
                // break out of the for loop
                break;
              } else {
                if (x != resumeResultsLineNo) {
                  results[x] = "\t" + results[x];
                }
              }
            }
          }
        }
      );
      // End- Add a tab to each line before resume until you reach an end for that event

      // Add a tab to each line before reend until you reach a resume for that event
      reendResults.forEach(
        (reendResultsLine: string, reendResultsLineNo: number) => {
          // If there is actually an end within the same session, then format all lines after the end and before the resume
          // to do: provide an example to help with debugging

          // go backwards starting from reend results line number until you find a resume
          for (let x = reendResultsLineNo; x >= 0; x--) {
            let regexEndStatement = new RegExp(
              `resume\\s.*?${reendResultsLine}`,
              "g"
            );

            let matchEndStatementResult = regexEndStatement.exec(results[x]);

            // if there is a match, we have reached the end statement, so we don't need to add any more tabs
            if (matchEndStatementResult && matchEndStatementResult.length > 0) {
              // break out of the for loop
              break;
            } else {
              if (x != reendResultsLineNo) {
                results[x] = "\t" + results[x];
              }
            }
          }
        }
      ); // End - Add a tab to each line before reend until you reach an end for that event

      // store results in fileContents
      fileContents = results.join("\n");
    }

    // Clean lines
    // Remove the end-ext, End-Function, end-method, end and reend calls, since we no longer need them
    let cleaned_lines: RegExpMatchArray = fileContents.match(
      /(?:.*(?:start|resume).*)|.*(?:call\s.*).*/gm
    );
    // if there lines in this session, store it in fileContents
    cleaned_lines != null ? (fileContents = cleaned_lines.join("\n")) : null;

    // Prefix all calls with suffix .OnExecute (apart from getter, setter and app engine steps) with call method
    fileContents = fileContents.replace(
      /call\s(?!(?:getter|setter))(.*\.OnExecute)$/gm,
      "call method $1"
    );

    // Prefix all remaining calls with call function
    fileContents = fileContents.replace(
      /call\s(?!(?:method|getter|setter|constructor|%s))(.*(?!\.OnExecute))$/gm,
      "call function $1"
    );

    // Rename eligible call methods to call constructors
    fileContents = fileContents.replace(
      /call\smethod\s+(\w+)(\s.*\1).OnExecute/gm,
      "call constructor $1$2"
    );

    // Rename to call function those start-ext calls that do not have getters, setters or constructors appended
    fileContents = fileContents.replace(
      /start-ext\s(\w+)\s(\w+\.\w+\.\w+)$/gm,
      "call function $1 $2"
    );

    // Replace any call constructors with the constructor name at the start
    // e.g. call constructor SCC_FLUID:UTIL:CSSClass
    // becomes call constructor CSSClass SCC_FLUID:UTIL:CSSClass
    fileContents = fileContents.replace(
      /call constructor\s(.*:)(\w+)/gm,
      "call constructor $2 $1$2"
    );

    // Replace any remaining start-ext with calls based on the last word in the line
    // e.g. start-ext isSaveWarning PT_NAV2.NavOptions.OnExecute getter
    // becomes call getter isSaveWarning PT_NAV2.NavOptions.OnExecute
    fileContents = fileContents.replace(
      /start-ext\s(\w+)\s(.*)\s(constructor|method|getter|setter)/gm,
      "call $3 $1 $2"
    );

    // Rename CI functions
    fileContents = fileContents.replace(
      /start-ext\s(\w+)\s(\w+\.\w+)$/gm,
      "call function $1 $2"
    );

    // Remove .OnExecute
    fileContents = fileContents.replace(/.OnExecute/gm, "");

    // Replace any colons with dots
    fileContents = fileContents.replace(/:/gm, ".");

    return fileContents;
  },
  extractCallStackWrapper(filePath: string): Promise<string> {
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

      var newFileStream = fs.createWriteStream(callStackFilePath);

      let fileContents: string = fs.readFileSync(filePath, "UTF-8");

      let newString: string;
      // regex: call constructor\s+(.*)\s+#params=
      // Find all call constructors that have #params in them, since they will have a duplicate call constructor line that we must delete:
      // For example:
      // PSAPPSRV.4164 (411) 	 1-8101   14.25.53    0.000000                                 32:    &oReport = create SSR_TRANSCRIPT:Report();
      // PSAPPSRV.4164 (411) 	 1-8102   14.25.53    0.000000                                     call constructor SSR_TRANSCRIPT:Report
      // PSAPPSRV.4164 (411) 	 1-8103   14.25.53    0.000000                                     call constructor  SSR_TRANSCRIPT:Report #params=0
      // PSAPPSRV.4164 (411) 	 1-8104   14.25.53    0.000000   >>> start-ext Nest=82 Report SSR_TRANSCRIPT.Report.OnExecute
      // PSAPPSRV.4164 (411) 	 1-8105   14.25.53    0.000000                               >>>>> Begin SSR_TRANSCRIPT.Report.OnExecute level 0 row 0
      let constructorLinestoRemove: string[] = [];
      let regexp = /call constructor\s+(.*)\s+#params=/g;
      let match = regexp.exec(fileContents);

      while (match != null) {
        constructorLinestoRemove.push(match[1]);
        match = regexp.exec(fileContents);
      }

      constructorLinestoRemove = [...new Set(constructorLinestoRemove)]; // Make array unique

      // First remove all lines that have a call getter, call setter, call method or call constructor followed by a start-ext, since the start-ext is sufficient
      // For example: the following call method line will be ignored since there is a start-ext immediately after it:
      // PSAPPSRV.4556 (2426)   1-8760   14.05.07    0.000000       call method  SSF_CFS:SSF_CFQKey.SSFQKeyString #params=7
      // PSAPPSRV.4556 (2426)   1-8761   14.05.07    0.000000   >>> start-ext Nest=01 SSFQKeyString SSF_CFS.SSF_CFQKey.OnExecute getter
      // Example 2: the following call constructor line will be ignored since there is a start-ext immediately after it:
      // PSAPPSRV.146732 (3396) 	 1-3050250 15.11.25    0.000000                               call constructor  SAA_ACADEMIC_PROGRESS_FL:COMPONENTS:SAA_ACD_PRG_SM_FL #params=0
      // PSAPPSRV.146732 (3396) 	 1-3050251 15.11.25    0.000000   >>> start-ext Nest=07 SAA_ACD_PRG_SM_FL SAA_ACADEMIC_PROGRESS_FL.COMPONENTS.SAA_ACD_PRG_SM_FL.OnExecute
      newString = fileContents.replace(
        /(?:.*call\s+(getter|setter|method|constructor).*)\r?\n(.*>>>\sstart-ext.*)/gm,
        "$2 $1"
      );

      // Remove the superfluous call constructors that we identified earlier
      constructorLinestoRemove.forEach(line => {
        let regexp = new RegExp(
          "(?:.*call\\s+constructor\\s+" + line + ")",
          "gm"
        );
        newString = newString.replace(regexp, "");
      });

      // Add an end-get for relevant lines
      // I.e. Find all internal call getters and add end-gets. This is done by matching line number before the call getter and after the getter method has finished
      // Note: This is really ugly, but I couldn't find a better way to do this. Plus it's all 'easily' done in one line of code
      // Note 2: This seems to make vscode hang for large files (e.g. 16mb)
      // For example:
      // PSAPPSRV.4164 (411) 	 1-10721  14.25.54    0.000000                               1002:    If %This.GetDatasource().Active = False Then
      // PSAPPSRV.4164 (411) 	 1-10722  14.25.54    0.000000                                     call getter  PSXP_RPTDEFNMANAGER:DataSourceDefn.Active #params=2
      // PSAPPSRV.4164 (411) 	 1-10723  14.25.54    0.000000   >>> start-ext Nest=84 Active PSXP_RPTDEFNMANAGER.DataSourceDefn.OnExecute
      // PSAPPSRV.4164 (411) 	 1-10724  14.25.54    0.000000                               >>>>> Begin PSXP_RPTDEFNMANAGER.DataSourceDefn.OnExecute level 0 row 0
      // PSAPPSRV.4164 (411) 	 1-10725  14.25.54    0.000000                                333: get Active
      // PSAPPSRV.4164 (411) 	 1-10726  14.25.54    0.000000                                334:    If &DataSource.Active_flag = "A" Or
      // PSAPPSRV.4164 (411) 	 1-10727  14.25.54    0.000000                                335:       Return ( True);
      // PSAPPSRV.4164 (411) 	 1-10728  14.25.54    0.000000                                     return stack:
      // PSAPPSRV.4164 (411) 	 1-10729  14.25.54    0.000000                                          UUUUUUUUUUUUUUUUUUU:DataSourceDefn
      // PSAPPSRV.4164 (411) 	 1-10730  14.25.54    0.000000                                          Str[6]=Active
      // PSAPPSRV.4164 (411) 	 1-10731  14.25.54    0.000000                                      return value:
      // PSAPPSRV.4164 (411) 	 1-10732  14.25.54    0.000000                                          Bool=True
      // PSAPPSRV.4164 (411) 	 1-10733  14.25.54    0.000000   <<< end-ext   Nest=84 Active PSXP_RPTDEFNMANAGER.DataSourceDefn.OnExecute Dur=0.000040 CPU=0.000000 Cycles=8
      // PSAPPSRV.4164 (411) 	 1-10734  14.25.54    0.000000                               1002:    If %This.GetDatasource().Active = False Then
      newString = newString.replace(
        /(\d+:.*)(\r?\n.*call getter\s+(?:\w+:?)+\.\w+[\s\S]*?)(.*)(\1)/gm,
        "$1$2$3end-get;"
      );

      //Remove unnecessary DoModals
      newString = newString.replace(
        /(\d+:.*DoModal\(.*)([\s\S]+?EndModal[\s\S]+?)(\1)/gm,
        "$1$2"
      );

      this.getStats(filePath).then((stats: any) => {
        var statistics: any = stats;
        // for each session number

        // Keep track of the number of sessions (for formatting purposes at the end)
        let sessionCount: number = 1;

        if (stats.sessionNos.length > 0) {
          /* This is a PSAPPSRV trace */
          /* sort sessionNos array */
          stats.sessionNos.sort(function(a: number, b: number) {
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
              statistics
            );

            // if we're at the first session then format the Session text slightly different
            sessionCount == 1
              ? (callStack += `Session ${sessionNo}:\n`)
              : (callStack += `\n\nSession ${sessionNo}:\n`);

            // Build up entire call stack with the call stack produced for this session
            callStack += sessionSpecificString;

            // Increment session count, go to next sessionNo if available
            sessionCount += 1;

            // We now have the complete callstack for the session
          }); // end - for each session number
        } else {
          /* This is probably an AE SQL/PeopleCode Trace */
          callStack = this.extractCallStackHelper(newString, statistics);
        }

        // Write the call stack to a file
        newFileStream.write(`${callStack}`);
        newFileStream.end();

        // Return the promise containing the call stack file
        resolve(callStackFilePath);
      });
    });
  }
};
