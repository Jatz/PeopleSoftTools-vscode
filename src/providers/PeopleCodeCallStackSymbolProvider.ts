"use strict";
import * as vscode from "vscode";

export class PeopleCodeCallStackSymbolProvider
  implements vscode.DocumentSymbolProvider {
  public provideDocumentSymbols(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Thenable<vscode.SymbolInformation[]> {
    return new Promise(resolve => {
      var symbols: any[] = [];

      // This line is here purely to satisfy linter
      token = token;

      for (var i = 0; i < document.lineCount; i++) {
        var line = document.lineAt(i);

        let lineTrimmed: string = line.text.trim();

        if (lineTrimmed.startsWith("call method")) {
          symbols.push({
            name: lineTrimmed.substr(0),
            kind: vscode.SymbolKind.Method,
            location: new vscode.Location(document.uri, line.range)
          });
        }

        if (lineTrimmed.startsWith("call function")) {
          symbols.push({
            name: lineTrimmed.substr(0),
            kind: vscode.SymbolKind.Function,
            location: new vscode.Location(document.uri, line.range)
          });
        }

        if (lineTrimmed.startsWith("call constructor")) {
          symbols.push({
            name: lineTrimmed.substr(0),
            kind: vscode.SymbolKind.Constructor,
            location: new vscode.Location(document.uri, line.range)
          });
        }

        if (lineTrimmed.startsWith("call getter")) {
          symbols.push({
            name: lineTrimmed.substr(0),
            kind: vscode.SymbolKind.Property,
            location: new vscode.Location(document.uri, line.range)
          });
        }

        if (lineTrimmed.startsWith("call setter")) {
          symbols.push({
            name: lineTrimmed.substr(0),
            kind: vscode.SymbolKind.Property,
            location: new vscode.Location(document.uri, line.range)
          });
        }

        if (lineTrimmed.startsWith("start")) {
          symbols.push({
            name: lineTrimmed.substr(0),
            kind: vscode.SymbolKind.Event,
            location: new vscode.Location(document.uri, line.range)
          });
        }

        if (lineTrimmed.startsWith("Session")) {
          symbols.push({
            name: lineTrimmed.substr(0),
            kind: vscode.SymbolKind.Module,
            location: new vscode.Location(document.uri, line.range)
          });
        }
      }

      resolve(symbols);
    });
  }
}
