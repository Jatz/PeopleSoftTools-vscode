/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const PeopleCodeSymbolProvider_1 = require("./providers/PeopleCodeSymbolProvider");
const PeopleCodeTraceSymbolProvider_1 = require("./providers/PeopleCodeTraceSymbolProvider");
const PeopleCodeCallStackSymbolProvider_1 = require("./providers/PeopleCodeCallStackSymbolProvider");
var tidier = require("./tidier");
var callStackExtractor = require("./callStackExtractor");
// vscode.languages.setLanguageConfiguration("peoplecode", {
//   // Allow ampersands to be part of a word by removing it from the wordPattern list.
//   wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\#\%\^\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g
//   wordPattern: /(-?\d.\d\w)|([^`~!\@#\%\^*()-\=+[{]}\|\;\:\'\"\,.\<>\/\?\s]+)/g
// });
function activate(context) {
    // Create the language client and start the client.
    let disposable = vscode.commands.registerCommand("extension.peoplesoft-tools-tidy-peoplecode-trace", () => __awaiter(this, void 0, void 0, function* () {
        if (vscode.window.activeTextEditor == undefined) {
            vscode.window.showErrorMessage("PeopleSoft Tools: Unable to find any file to tidy");
        }
        else {
            let document = vscode.window.activeTextEditor.document;
            try {
                const filePath = yield tidier.errorLines(document.fileName);
                let openPath = vscode.Uri.file(filePath);
                const textDocument = yield vscode.workspace.openTextDocument(openPath);
                vscode.window.showTextDocument(textDocument);
            }
            catch (error) {
                console.log(error);
                vscode.window.showErrorMessage(error);
            }
        }
    }));
    let disposable2 = vscode.commands.registerCommand("extension.peoplesoft-tools-extract-call-stack", () => {
        if (vscode.window.activeTextEditor == undefined) {
            vscode.window.showErrorMessage("PeopleSoft Tools: Unable to find any file to extract call stack");
        }
        else {
            let document = vscode.window.activeTextEditor.document;
            const extractCallStack = () => __awaiter(this, void 0, void 0, function* () {
                const filePath = yield callStackExtractor.extractCallStackWrapper(document.fileName);
                let openPath = vscode.Uri.file(filePath);
                const textDocument = yield vscode.workspace.openTextDocument(openPath);
                yield vscode.window.showTextDocument(textDocument);
            });
            extractCallStack().catch(err => {
                console.log(err);
                vscode.window.showErrorMessage(err);
            });
        }
    });
    // Push the disposable to the context's subscriptions so that the
    // client can be deactivated on extension deactivation
    context.subscriptions.push(disposable);
    context.subscriptions.push(disposable2);
    context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider({ language: "peoplecode" }, new PeopleCodeSymbolProvider_1.PeopleCodeSymbolProvider()));
    context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider({ language: "peoplecode_trace" }, new PeopleCodeTraceSymbolProvider_1.PeopleCodeTraceSymbolProvider()));
    context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider({ language: "peoplesoft_callstack" }, new PeopleCodeCallStackSymbolProvider_1.PeopleCodeCallStackSymbolProvider()));
}
exports.activate = activate;
//# sourceMappingURL=extension.js.map