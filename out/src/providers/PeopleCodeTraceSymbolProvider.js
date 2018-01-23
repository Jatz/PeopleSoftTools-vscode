"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
class PeopleCodeTraceSymbolProvider {
    provideDocumentSymbols(document, token) {
        return new Promise(resolve => {
            var symbols = [];
            // This line is here purely to satisfy linter
            token = token;
            for (var i = 0; i < document.lineCount; i++) {
                var line = document.lineAt(i);
                let methodExtract = /(method)\s([\w]+)/.exec(line.text);
                if (methodExtract) {
                    symbols.push({
                        name: methodExtract[0],
                        kind: vscode.SymbolKind.Method,
                        location: new vscode.Location(document.uri, line.range)
                    });
                }
                let functionExtract = /(Function)\s([\w]+)/.exec(line.text);
                if (functionExtract) {
                    symbols.push({
                        name: functionExtract[0],
                        kind: vscode.SymbolKind.Function,
                        location: new vscode.Location(document.uri, line.range)
                    });
                }
                let classExtract = /(class)\s([\w]+)/.exec(line.text);
                if (classExtract) {
                    symbols.push({
                        name: classExtract[0],
                        kind: vscode.SymbolKind.Class,
                        location: new vscode.Location(document.uri, line.range)
                    });
                }
                let eventExtract = /(?:>>>>> Begin ).+?(?=[\s|$])/.exec(line.text);
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
exports.PeopleCodeTraceSymbolProvider = PeopleCodeTraceSymbolProvider;
//# sourceMappingURL=PeopleCodeTraceSymbolProvider.js.map