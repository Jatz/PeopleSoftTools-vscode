# PeopleSoft Tools - VSCode Plugin

This repository contains the following:
- Syntax Highlighter for PeopleCode and PeopleSoft Trace files
- Extract Call Stack tool
- Tidy PeopleCode Trace tool
- PeopleCode Snippets

### Syntax Highlighter for PeopleCode and PeopleSoft Trace files

The syntax highlighter applies to files with the following extensions:
- ppl (PeopleCode)
- pcode (PeopleCode)
- tracesql (PeopleSoft Trace Files)
- trc (PeopleSoft COBOL Trace Files)

**Note:** To allow selection of a variable via a double-click, add the following to your User Settings:
```json
  "[peoplecode]": {
    "editor.wordSeparators": "`~!@#$%^*()-=+[{]}\\|;:'\",.<>/?",
  }
```

### Extract Call Stack tool

This tool will extract and format the call stack from a PeopleSoft trace file.

This tool ONLY applies to PeopleSoft Trace Files that have the following PeopleCode trace flags:
- Program Starts (64)
- External function calls (128)
- Internal function calls (256)
- Return parameter values (1024)
- Each statement (2048)

Trace files that have not been generated using these trace flags will not produce enough information for the tool to format the call stack. To use the tool, open a .tracesql file in VSCode and then run the "PeopleSoft Tools: Extract Call Stack" command from the command palette.

**Note:** A new call stack file will be created in the same folder as the trace file

### Tidy PeopleCode Trace tool

This tool will tidy up a tracesql file by performing the following operations:
- Adding a matching quote to the end of certain lines that have an odd number of quotes, ensuring that the syntax highlighting of the PeopleCode trace file works correctly.
- Removing blank lines (peoplesoft-tools-tidy.removeAllBlankLines)
- Removing the header text to make the trace file easier to read (peoplesoft-tools-tidy.removeHeaders). This option is enabled by default. Feel free to set this to false in the user settings for this plugin if you would like to disable this functionality.

**Note:** A new tidied file will be created in the same folder as the trace file
