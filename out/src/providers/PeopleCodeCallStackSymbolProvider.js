"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
class PeopleCodeCallStackSymbolProvider {
    provideDocumentSymbols(document, token) {
        return new Promise(resolve => {
            var symbols = [];
            // This line is here purely to satisfy linter
            token = token;
            for (var i = 0; i < document.lineCount; i++) {
                var line = document.lineAt(i);
                let lineTrimmed = line.text.trim();
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
exports.PeopleCodeCallStackSymbolProvider = PeopleCodeCallStackSymbolProvider;
//# sourceMappingURL=PeopleCodeCallStackSymbolProvider.js.map