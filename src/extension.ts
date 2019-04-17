'use strict';

import * as path from 'path';
import * as cp from 'child_process';
import ChildProcess = cp.ChildProcess;

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';


class State {
    public static diagnostics: vscode.DiagnosticCollection;

    public static initialize() {
        this.diagnostics = vscode.languages.createDiagnosticCollection('Boogie');
    }
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    State.initialize();
    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json
    let disposable = vscode.commands.registerCommand('boogie.verifyFile', verifyFile);

    context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() { }

function verifyFile(): void {
    if (vscode.window.activeTextEditor) {
        let document = vscode.window.activeTextEditor.document;
        let options = undefined;
        // vscode.workspace.rootPath ? { cwd: vscode.workspace.rootPath } : undefined;
        let filePath = vscode.window.activeTextEditor.document.fileName;
        let boogieArgs: string[] = []; // TODO get args from first line
        let args = ['-f', 'TIME %e', 'boogie'].concat(boogieArgs, [filePath]);
        let rawResult = '';

        let childProcess = cp.spawn('time', args, options);  //  boogie
        childProcess.on('error', (err) => {
            console.log('Failed to start subprocess.\n' + err);
        });
        if (childProcess.pid) {
            childProcess.stdout.on('data', (data: Buffer) => rawResult += data);
            childProcess.stderr.on('data', (data: Buffer) => rawResult += data);
            childProcess.on('close', (code: Number, _: string) => {
                console.log(rawResult);
                let lines = rawResult.split('\n');
                let errorRegex = '^[^ (]*\\((\\d+),(\\d+)\\): (\\w+)\\b(.*)$';
                let i = 1;
                let diags = [];
                let time = '';
                while (i < lines.length) {
                    let res = lines[i].match(errorRegex);
                    if (res) {
                        let lineNum = Number(res[1]) - 1;
                        let startChar = Number(res[2]) - 1;
                        let endChar = document.lineAt(lineNum).range.end.character;

                        // Gather all the trace info etc
                        let msg = res[3] + res[4];
                        while ((lines[++i].trim() !== '') && !lines[i].match(errorRegex)) {
                            msg += '\n' + lines[i];
                        }

                        diags.push(new vscode.Diagnostic(
                            new vscode.Range(new vscode.Position(lineNum, startChar),
                                new vscode.Position(lineNum, endChar)),
                            msg,
                            (res[3].toLowerCase() === 'error' ?
                                vscode.DiagnosticSeverity.Error
                                : vscode.DiagnosticSeverity.Information)
                            // relatedInformation: [  // TODO
                            //     new vscode.DiagnosticRelatedInformation(new vscode.Location(document.uri, new vscode.Range(new vscode.Position(1, 8), new vscode.Position(1, 9))), 'first assignment to `x`')
                            // ]
                        ));
                        // console.log(`${res[1]}/${res[2]}: ${res[3]}`);
                    } else if (lines[i].startsWith('TIME')) {
                        let rawSecs = lines[i++].split(' ')[1];
                        let mins = Math.floor(+rawSecs / 60);
                        let secs = (+rawSecs % 60).toFixed(1);
                        time = (mins > 0 ? mins + 'm' : '') + secs + 's';
                    } else {
                        console.log(lines[i++]);
                    }
                }
                State.diagnostics.set(document.uri, diags);
                let fileName = filePath.split('/').pop();
                if (code !== 0) {
                    vscode.window.showErrorMessage(
                        'Boogie: ' + fileName + ': verification failed with code ' 
                        + code + ' (' + time + ').');
                } else if (diags.length > 0) {
                    vscode.window.showInformationMessage(
                        'Boogie: ' + fileName + ': ' + diags.length + ' errors ('
                        + time + ').');
                } else {
                    vscode.window.showInformationMessage(
                        'Boogie: ' + fileName + ' verified successfully ('
                        + time + ').');
                }
            });
        } else {
            vscode.window.showErrorMessage('Boogie: Failed to start subprocess.');
        }
    } else {
        vscode.window.showErrorMessage('Boogie: No active window.');
    }

}