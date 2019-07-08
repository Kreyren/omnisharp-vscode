/*--------------------------------------------------------------------------------------------- 
*  Copyright (c) Microsoft Corporation. All rights reserved. 
*  Licensed under the MIT License. See License.txt in the project root for license information. 
*--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';

import { should, expect } from 'chai';
import { activateCSharpExtension } from './integrationHelpers';
import testAssetWorkspace from './testAssets/testAssetWorkspace';
import poll from './poll';
import { EventStream } from '../../src/EventStream';
import { EventType } from '../../src/omnisharp/EventType';
import { BaseEvent, OmnisharpProjectDiagnosticStatus } from '../../src/omnisharp/loggingEvents';
import { DiagnosticStatus } from '../../src/omnisharp/protocol';

const chai = require('chai');
chai.use(require('chai-arrays'));
chai.use(require('chai-fs'));

function listenEvents<T extends BaseEvent>(stream: EventStream, type: EventType): T[]
{
    let results: T[] = [];

    stream.subscribe((event: BaseEvent) => {
        if(event.type === type)
        {
            results.push(<T>event);
        }
    });

    return results;
}

suite(`ReAnalyze: ${testAssetWorkspace.description}`, function () {
    let interfaceUri: vscode.Uri;
    let interfaceImplUri: vscode.Uri;
    let eventStream: EventStream;

    suiteSetup(async function () {
        should();

        await testAssetWorkspace.restore();
        eventStream = (await activateCSharpExtension()).eventStream;

        let projectDirectory = testAssetWorkspace.projects[0].projectDirectoryPath;
        interfaceUri = vscode.Uri.file(path.join(projectDirectory, 'ISomeInterface.cs'));
        interfaceImplUri = vscode.Uri.file(path.join(projectDirectory, 'SomeInterfaceImpl.cs'));

        await vscode.commands.executeCommand("vscode.open", interfaceImplUri);
        await vscode.commands.executeCommand("vscode.open", interfaceUri);
    });

    suiteTeardown(async () => {
        await testAssetWorkspace.cleanupWorkspace();
    });

    test("When interface is manually renamed, then return correct analysis after re-analysis of project", async function () {
        this.skip(); // Enable once background analysis is merged on omnisharp-roslyn side.
        let diagnosticStatusEvents = listenEvents<OmnisharpProjectDiagnosticStatus>(eventStream, EventType.ProjectDiagnosticStatus);

        await vscode.commands.executeCommand("vscode.open", interfaceUri);

        let editor = vscode.window.activeTextEditor;

        await editor.edit(editorBuilder => editorBuilder.replace(new vscode.Range(2, 0, 2, 50), 'public interface ISomeInterfaceRenamedNow'));

        await vscode.commands.executeCommand('o.reanalyze.currentProject', interfaceImplUri);

        await poll(() => diagnosticStatusEvents, 10*1000, 500, r => r.find(x => x.message.Status === DiagnosticStatus.Ready) != undefined);

        let typeNotFoundCs = vscode.languages.getDiagnostics(interfaceImplUri).find(x => x.message.includes("CS0246"));
        expect(typeNotFoundCs).to.not.be.undefined;
    });

    test("When re-analyze of project is executed then eventually get notified about them.", async function () {
        this.skip(); // Enable once background analysis is merged on omnisharp-roslyn side.
        let diagnosticStatusEvents = listenEvents<OmnisharpProjectDiagnosticStatus>(eventStream, EventType.ProjectDiagnosticStatus);

        await vscode.commands.executeCommand('o.reanalyze.currentProject', interfaceImplUri);

        await poll(() => diagnosticStatusEvents, 10*1000, 500, r => r.find(x => x.message.Status === DiagnosticStatus.Processing) != undefined);
        await poll(() => diagnosticStatusEvents, 10*1000, 500, r => r.find(x => x.message.Status === DiagnosticStatus.Ready) != undefined);
    });

    test("When re-analyze of all projects is executed then eventually get notified about them.", async function () {
        this.skip(); // Enable once background analysis is merged on omnisharp-roslyn side.
        let diagnosticStatusEvents = listenEvents<OmnisharpProjectDiagnosticStatus>(eventStream, EventType.ProjectDiagnosticStatus);

        await vscode.commands.executeCommand('o.reanalyze.allProjects', interfaceImplUri);

        await poll(() => diagnosticStatusEvents, 10*1000, 500, r => r.find(x => x.message.Status === DiagnosticStatus.Processing) != undefined);
        await poll(() => diagnosticStatusEvents, 10*1000, 500, r => r.find(x => x.message.Status === DiagnosticStatus.Ready) != undefined);
    });
});
