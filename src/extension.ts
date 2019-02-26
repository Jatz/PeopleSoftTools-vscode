/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
"use strict";

import { ExtensionContext } from "vscode";
import * as vscode from "vscode";
import { PeopleCodeSymbolProvider } from "./providers/PeopleCodeSymbolProvider";
import { PeopleCodeTraceSymbolProvider } from "./providers/PeopleCodeTraceSymbolProvider";
import { PeopleCodeCallStackSymbolProvider } from "./providers/PeopleCodeCallStackSymbolProvider";
import { Timer } from "./utils/utils";

var tidier = require("./tidier");
var callStackExtractor = require("./callStackExtractor");

export function activate(context: ExtensionContext) {
  // Create the language client and start the client.
  let disposable = vscode.commands.registerCommand(
    "extension.peoplesoft-tools-tidy-peoplecode-trace",
    async () => {
      if (vscode.window.activeTextEditor == undefined) {
        vscode.window.showErrorMessage(
          "PeopleSoft Tools: Unable to find any file to tidy"
        );
      } else {
        let document = vscode.window.activeTextEditor.document;

        try {
          const filePath: string = await tidier.errorLines(document.fileName);
          let openPath = vscode.Uri.file(filePath);
          const textDocument: vscode.TextDocument = await vscode.workspace.openTextDocument(
            openPath
          );
          vscode.window.showTextDocument(textDocument);
        } catch (error) {
          console.log(error);
          vscode.window.showErrorMessage(error);
        }
      }
    }
  );

  let disposable2 = vscode.commands.registerCommand(
    "extension.peoplesoft-tools-extract-call-stack",
    () => {

      if (vscode.window.activeTextEditor == undefined) {
        vscode.window.showErrorMessage(
          "PeopleSoft Tools: Unable to find any file to extract call stack"
        );
      } else {

        vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: "Extracting call stack",
          cancellable: true
        }, async (progress, token) => {

          let timer = new Timer();

          progress.report({ increment: 0, message: "Started" });

          token.onCancellationRequested(() => {
            console.log("User canceled the long running operation")
          });

          let document = vscode.window.activeTextEditor.document;

          // Define extract call stack function and call it later
          const extractCallStack = async (progress: vscode.Progress<{ message?: string; increment?: number; }>) => {
            const filePath: string = await callStackExtractor.extractCallStackWrapper(
              document.fileName,
              progress
            );

            let openPath = vscode.Uri.file(filePath);
            const textDocument: vscode.TextDocument = await vscode.workspace.openTextDocument(
              openPath
            );

            await vscode.window.showTextDocument(textDocument);
          };

          // Call it here
          await extractCallStack(progress).catch(err => {
            console.log(err);
            vscode.window.showErrorMessage(err);
          });

          timer.end();
          let duration: string;
          let time_measurement: string;
          switch (Math.floor(timer.getDuration() / 1000)) {
            case 0:
              duration = timer.getDuration().toFixed(0);
              time_measurement = "ms"
              break;
            default:
              duration = (timer.getDuration() / 1000).toFixed(3);
              time_measurement = "seconds"
          }

          progress.report({ increment: 100, message: `Completed in ${duration} ${time_measurement}` });

          var p = new Promise(resolve => {
            setTimeout(() => {
              resolve();
            }, 5000);
          });

          return p;
        });

      }

    }
  );

  // Push the disposable to the context's subscriptions so that the
  // client can be deactivated on extension deactivation
  context.subscriptions.push(disposable);
  context.subscriptions.push(disposable2);
  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(
      { language: "peoplecode" },
      new PeopleCodeSymbolProvider()
    )
  );

  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(
      { language: "peoplecode_trace" },
      new PeopleCodeTraceSymbolProvider()
    )
  );

  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(
      { language: "peoplesoft_callstack" },
      new PeopleCodeCallStackSymbolProvider()
    )
  );
}
