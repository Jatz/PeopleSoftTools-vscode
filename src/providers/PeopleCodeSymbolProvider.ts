"use strict";
import * as vscode from "vscode";

export class PeopleCodeSymbolProvider implements vscode.DocumentSymbolProvider {
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

        if (line.text.startsWith("method")) {
          symbols.push({
            name: line.text.substr(0),
            kind: vscode.SymbolKind.Method,
            location: new vscode.Location(document.uri, line.range)
          });
        }

        if (line.text.startsWith("class")) {
          symbols.push({
            name: line.text.substr(0),
            kind: vscode.SymbolKind.Class,
            location: new vscode.Location(document.uri, line.range)
          });
        }

        if (line.text.startsWith("Function")) {
          symbols.push({
            name: line.text.substr(0),
            kind: vscode.SymbolKind.Class,
            location: new vscode.Location(document.uri, line.range)
          });
        }

        if (line.text.startsWith("[")) {
          symbols.push({
            name: line.text.substr(0),
            kind: vscode.SymbolKind.Event,
            location: new vscode.Location(document.uri, line.range)
          });
        }
      }

      resolve(symbols);
    });
  }
}
