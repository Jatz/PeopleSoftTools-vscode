var fs = require("fs"),
  // util = require("util"),
  // stream = require("stream"),
  es = require("event-stream"),
  path = require("path");

import * as vscode from "vscode";
// var tmp = require("tmp");

var settings: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(
  "peoplesoft-tools-tidy"
);

module.exports = {
  errorLines(filePath: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let filePathDir = path.dirname(filePath);
      let fileNameWithoutExtension = path.basename(
        filePath,
        path.extname(filePath)
      );
      let fileExt = path.extname(filePath);
      let tidiedFilePath: string = `${filePathDir}\\${fileNameWithoutExtension}_tidied${fileExt}`;

      var newFileStream = fs.createWriteStream(tidiedFilePath);
      var lineNr = 0;
      var traceType: string = "";
      // var linesNeedingTidying: number[] = [];
      // var linesNeedingPSAPPSRVRemoved: number[] = [];

      var s = fs
        .createReadStream(filePath)
        .pipe(es.split())
        .pipe(
          es
            .mapSync(function(line: string) {
              // pause the readstream
              s.pause();

              lineNr += 1;

              // process line here and call s.resume() when rdy
              let quote_match_result = line.match(/\"/gi);
              if (
                quote_match_result != null &&
                quote_match_result.length % 2 != 0
              ) {
                line = line + '" - Quote added by Tidy';
                // linesNeedingTidying.push(lineNr);
              }

              // if there are PSAPPSRV headers, strip them
              // we check for 2 types of PSAPPSRV headers
              if (settings.removeHeaders) {
                let results_psappsrv_header_type_1: string[] = /(^PSAPPSRV.*?\d\.\d{6}\s)(.*)/.exec(
                  line
                );

                if (results_psappsrv_header_type_1) {
                  line = results_psappsrv_header_type_1[2];
                }

                let results_psappsrv_header_type_2: string[] = /(^PSAPPSRV.*@JavaClient.*IntegrationSvc\]\(\d\)\s{3})(.*)/.exec(
                  line
                );

                if (results_psappsrv_header_type_2) {
                  line = results_psappsrv_header_type_2[2];
                }

                // remove headers that result from traces directly from an app engine
                if (!traceType) {
                  let header_match_result = line.match(
                    /PeopleTools\(\d+.\d+.\d+\) AE SQL\/PeopleCode Trace - \d\d\d\d-\d\d-\d\d/i
                  );

                  if (
                    header_match_result != null &&
                    header_match_result.length > 0
                  ) {
                    traceType = "AESQLPeopleCode";
                    line = "";
                  }
                }
                if (traceType == "AESQLPeopleCode") {
                  line = line.replace(
                    /Line     Time       Elapsed Trace Data.*/,
                    ""
                  );

                  line = line.replace(
                    /-------- --------   ------- ------------->/,
                    ""
                  );

                  line = line.replace(
                    /^\d+\s+\d+:\d+:\d+\.\d+\s+\d+\.\d+\s/,
                    ""
                  );

                  // The first line won't have any elapsed time
                  line = line.replace(
                    /^1\s+\d+:\d+:\d+\.\d+\s{14}/,
                    ""
                  );

                }
              }

              // We also check for blank lines, and if there are any we ignore them
              if (settings.removeAllBlankLines && /^\s*$/.test(line)) {
                // console.log("Found blank line");
              } else {
                newFileStream.write(`${line}\n`);
              }

              // resume the readstream, possibly from a callback
              s.resume();
            })
            .on("error", function(err: string) {
              console.log("Error while reading file.", err);
              reject([]);
            })
            .on("end", function() {
              // console.log("Read entire file.");

              // linesNeedingTidying.map(line => {
              //   console.log(`Line ${line} has an unmatched quote`);
              // });

              newFileStream.end();

              resolve(tidiedFilePath);
            })
        );
    });
  }
};
