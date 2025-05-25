//////////////////////////////////////////////////////////////////////80////////////////////80
// Atheos-Beautify: Beautify PHP, CSS, JS & HTML for the Atheos IDE
//////////////////////////////////////////////////////////////////////80////////////////////80
// Copyright (c) 2020 Liam Siira (liam@siira.io), distributed as-is and without
// warranty under the MIT License. See [root]/license.md for more.
// This information must remain intact.
//////////////////////////////////////////////////////////////////////80////////////////////80
// Copyright (c) 2015 Andr3as
// Source: https://github.com/Andr3as/Codiad-Beautify
//////////////////////////////////////////////////////////////////////80////////////////////80


(function(global) {
	'use strict';

	const self = {

		path: atheos.path + 'plugins/Beautify/',
		
		beautifyPhp: null,

		autoBeautifyExtensions: {
			css: false,
			html: false,
			js: false,
			json: false,
			php: false
		},

		guessCursorPosition: true,
		cleanWhitespace: true,

		settings: {
			indent_size: 1,
			indent_char: "\t",
			indent_level: 0,
			indent_with_tabs: false,
			preserve_newlines: true,
			max_preserve_newlines: 10,
			jslint_happy: false,
			brace_style: "collapse",
			keep_array_indentation: false,
			keep_function_indentation: false,
			space_before_conditional: true,
			break_chained_methods: false,
			eval_code: false,
			unescape_strings: false,
			wrap_line_length: 0
		},

		types: ["html", "htm", "js", "json", "scss", "css", "twig", "php", "hbs", "handlebars"],

		//////////////////////////////////////////////////////////////////////80
		// Initalized
		//////////////////////////////////////////////////////////////////////80
		init: function() {
			//Load libs
			atheos.common.loadScript(self.path + "libs/beautify-css.js");
			atheos.common.loadScript(self.path + "libs/beautify-html.js");
			atheos.common.loadScript(self.path + "libs/beautify.js");
			atheos.common.loadScript(self.path + "libs/ext-beautify.js", function() {
				self.beautifyPhp = ace.require("ace/ext/beautify");
			});

			//Set subscriptions
			carbon.subscribe('active.focus', function(path) {
				if (atheos.editor.getActive() === null) return;
				var manager = atheos.editor.getActive().commands;
				manager.addCommand({
					name: "Beautify",
					bindKey: {
						win: "Ctrl-Alt-B",
						mac: "Command-Alt-B"
					},
					exec: function() {
						self.beautify();
					}
				});
			});

			carbon.subscribe('active.save', self.autoBeautify);

			carbon.subscribe('settings.loaded, settings.saved', function() {
				self.guessCursorPosition = storage('beautify.guessCursorPosition') || true;
				self.cleanWhitespace = storage('beautify.cleanWhitespace') || false;
				self.autoBeautify.css = storage('beautify.css') || false;
				self.autoBeautify.html = storage('beautify.html') || false;
				self.autoBeautify.js = storage('beautify.js') || false;
				self.autoBeautify.json = storage('beautify.json') || false;
				self.autoBeautify.php = storage('beautify.php') || false;

			});
		},

		//////////////////////////////////////////////////////////////////////80
		//
		//  Beautify content
		//
		//  Parameters
		//
		//  path - {string} - File path
		//  content - {string} - Content to beautify
		//  settings - {object} - Settings for beautify
		//
		//////////////////////////////////////////////////////////////////////80
		beautifyContent: function(ext, content, settings) {
			self.checkBeautifySettings();

			if (typeof(settings) == 'undefined') {
				settings = self.settings;
			}

			if (ext === "html" || ext === "htm" || ext === "hbs" || ext === "handlebars") {
				return html_beautify(content, settings);
			} else if (ext === "css" || ext === "scss") {
				return css_beautify(content, settings);
			} else if (ext === "js" || ext === "json") {
				return js_beautify(content, settings);
			} else if (ext === "php" || ext === "twig") {
				return self.beautifyPhpString(content);
			} else if (self.cleanWhitespace) {
				return content.replace(/[ \t]+$/gm, '');
			} else {
			    return false;
			}
		},

		//////////////////////////////////////////////////////////////////////80
		//  Beautify command to handle hotkey
		//////////////////////////////////////////////////////////////////////80
		beautify: function(path) {
			var localSettings = self.settings;
			path = path || atheos.active.getPath();

			var session = atheos.active.getSession(path);
			var selection = session.selection;

			var activePath = atheos.active.getPath();
			var ext = pathinfo(path).extension;

			let oldCursor = (path === activePath) ? extend(selection.cursor) : false;
			let oldIndex = (path === activePath) ? session.getDocument().positionToIndex(oldCursor) : false;
			
			if (selection.rangeCount == 0) {
				selection.selectAll();
			} else {
				localSettings.indent_level = "keep";
			}

// 			var selectionRange = selection.getAllRanges();
			var selectedRange = selection.getRange();
			var oldContent = session.getTextRange(selectedRange);

			// Temporarily disabling multi-selection beaufication due to range changes.
			// for (var i = 0; i < selectionRanges.length; i++) {
			// range.start.column = 0;

			var newContent = self.beautifyContent(ext, oldContent);
			if (typeof(newContent) !== 'string' || oldContent === newContent) return false;
			session.replace(selectedRange, newContent);
			selection.clearSelection();

			if (path === activePath) {
				// Save the old cursor position to the undoStack
				const undoStack = session.getUndoManager().$undoStack;
				undoStack[undoStack.length - 1].cursor = oldCursor;

				if (self.guessCursorPosition) {
					//  Guess the cursor position after beautifying content
					let newIndex = self.findCursorIndex(oldContent, newContent, oldIndex);
					let newCursor = session.getDocument().indexToPosition(newIndex);
				// 	log(`Guessing cursor moved to ${newIndex} from ${oldIndex}`);
					selection.moveCursorToPosition(newCursor);
				}
			}
		},

		//////////////////////////////////////////////////////////////////////80
		//  Check the autoBeautify settings for given extension
		//////////////////////////////////////////////////////////////////////80
		autoBeautify: function(path) {
			if (!self.autoBeautifyEnabled) return;

			path = path || atheos.active.getPath();
			var ext = pathinfo(path).extension;
			ext = 'htm' ? 'html' : ext;
			ext = 'scss' ? 'css' : ext;

			if (self.autoBeautifyExtensions[ext]) {
				self.beautifyPath(path);
			}
		},

		//////////////////////////////////////////////////////////////////////80
		//  Check settings for beautify
		//////////////////////////////////////////////////////////////////////80
		checkBeautifySettings: function() {
			let softTabs = atheos.editor.settings.softTabs;
			self.settings.indent_char = softTabs ? " " : "\t";
			self.settings.indent_size = softTabs ? 4 : 1;
		},

		//////////////////////////////////////////////////////////////////////80
		//  Find new Cursor Positions
		//////////////////////////////////////////////////////////////////////80
		findCursorIndex: function(oldContent, newContent, oldIndex) {
			const isWhitespace = c => /\s/.test(c);

			// Step 1: Walk oldContent to count non-whitespace up to oldIndex
			let offset = 0;
			for (let i = 0; i < oldIndex; i++) {
				if (!isWhitespace(oldContent[i])) offset++;
			}

			// Step 2: Walk newContent to find the same offset
			let count = 0,
				i = 0;
			while (i < newContent.length && count < offset) {
				if (!isWhitespace(newContent[i])) count++;
				i++;
			}

			return i; // new cursor index
		},

		beautifyPhpString: function(content) {
			const EditSession = ace.require("ace/edit_session").EditSession;
			const PhpMode = ace.require("ace/mode/php").Mode;

			let session = new EditSession(content);
			session.setMode(new PhpMode());

			self.beautifyPhp.beautify(session);

			return session.getValue();
		}
	};

	carbon.subscribe('system.loadExtra', () => self.init());
	atheos.beautify = self;


	// One-time setup: extend UndoManager to track cursor positions
	(function patchUndoManager() {
		const UndoManager = ace.require("ace/undomanager").UndoManager;
		log('Patching UndoManager to track cursor positions during beautification');

		if (!UndoManager.prototype._patchedForCursor) {
			const originalUndo = UndoManager.prototype.undo;

			UndoManager.prototype.undo = function(...args) {
				const entry = this.$undoStack[this.$undoStack.length - 1];
				const result = originalUndo.apply(this, args);

				if (entry && entry.cursor && atheos && atheos.editor) {
					const editor = atheos.editor.getActive();
					if (editor) {
						editor.clearSelection();
						editor.moveCursorToPosition(entry.cursor);
					}
				}

				return result;
			};

			UndoManager.prototype._patchedForCursor = true;
		}
	})();


})();