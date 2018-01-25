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
var tidier = require("./tidier");
var callStackExtractor = require("./callStackExtractor");

// vscode.languages.setLanguageConfiguration("peoplecode", {
//   // Allow ampersands to be part of a word by removing it from the wordPattern list.
//   wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\#\%\^\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g
//   wordPattern: /(-?\d.\d\w)|([^`~!\@#\%\^*()-\=+[{]}\|\;\:\'\"\,.\<>\/\?\s]+)/g
// });

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
        let document = vscode.window.activeTextEditor.document;

        const extractCallStack = async () => {
          const filePath: string = await callStackExtractor.extractCallStackWrapper(
            document.fileName
          );

          let openPath = vscode.Uri.file(filePath);
          const textDocument: vscode.TextDocument = await vscode.workspace.openTextDocument(
            openPath
          );

          await vscode.window.showTextDocument(textDocument);
        };

        extractCallStack().catch(err => {
          console.log(err);
          vscode.window.showErrorMessage(err);
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
