"use strict";
import * as vscode from "vscode";

export class PeopleCodeTraceSymbolProvider
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

        let methodExtract: string[] = /(method)\s([\w]+)/.exec(line.text);

        if (methodExtract) {
          symbols.push({
            name: methodExtract[0],
            kind: vscode.SymbolKind.Method,
            location: new vscode.Location(document.uri, line.range)
          });
        }

        let functionExtract: string[] = /(Function)\s([\w]+)/.exec(line.text);
        if (functionExtract) {
          symbols.push({
            name: functionExtract[0],
            kind: vscode.SymbolKind.Function,
            location: new vscode.Location(document.uri, line.range)
          });
        }

        let classExtract: string[] = /(class)\s([\w]+)/.exec(line.text);
        if (classExtract) {
          symbols.push({
            name: classExtract[0],
            kind: vscode.SymbolKind.Class,
            location: new vscode.Location(document.uri, line.range)
          });
        }

        let eventExtract: string[] = /(?:>>>>> Begin ).+?(?=[\s|$])/.exec(
          line.text
        );
        if (eventExtract) {
          symbols.push({
            name: eventExtract[0].replace(">>>>> Begin ", ""),
            kind: vscode.SymbolKind.Function,
            location: new vscode.Location(document.uri, line.range)
          });
        }
      }

      resolve(symbols);
    });
  }
}
