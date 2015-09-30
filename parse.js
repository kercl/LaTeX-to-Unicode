parser = {
	replace_chars: function(x, table) {
		var res = "";
		for(i in x)
			if(x[i] in table)
				res = res + table[x[i]];
			else
				res = res + x[i];
		return res;
	},
	
	strings_disjoint: function(x, y) {
		if(x.length != y.length)
			return false;
		
		for(var i = 0; i < x.length; i++)
			if(x[i] == y[i])
				return false;
		return true;
	},

	optimize: function(tokens) {	
		var single = "";
		var sliceat = -1;
		
		for(var i = 0; i < tokens.length; i++) {
			if((tokens[i].object.length == 1 &&
			   "_^{}".indexOf(tokens[i].object) == -1) || this.whitespace(tokens[i].object))
				single = single + tokens[i].object;
			else {
				sliceat = i;
				break;
			}
		}
		if(sliceat == -1)
			return [{object:single}];
		return [{object:single}].concat(tokens.slice(sliceat));
	},

	tokenize: function(str) {
		var ret = [];
		
		str = str.replace(/\u200B/g, "\\");
		
		while(str != "") {
			var s = "";
			if("_^{}".indexOf(str[0]) > -1) {
				s = str[0];
			}else if(str[0] == '\\') {
				s = str.match(/^\\([a-zA-Z]+|\$|\\|\{|\}| |\_|\^)/g);
				if(s != null)
					s = s[0];
				else
					s = str[0];
			}else {
				var s1 = str.match(/^[^_\\\$\^\{\}\s]/g),
					s2 = str.match(/^[^_\\\$\^\{\}\S]+/g);
					
				if(s1 == null) {
					s = s2[0];
				}else if(s2 == null) { // not whitespace
					s = s1[0];
				}else {
					s = s[0];
				}
			}
			
			ret.push({object:s});
			str = str.substring(Math.max(1,s.length));
		}
		var ret2 = this.optimize(ret);
		return ret2;
	},
	
	whitespace: function(str) {
		return str.match(/^\s+/g) != null;
	},
	
	tag: function(tok) {
		return (tok.object[0] == "\\" && tok.object.length > 1) || tok.object == "^" || tok.object == "_";
	},
	
	extract_block: function(tokens, begin) {
		if(tokens[begin] == undefined)
			return [];
		
		if((this.tag(tokens[begin]) || tokens[begin].object == "\\") && tokens[begin].caret != undefined)
			return [];
		
		if(tokens[begin].object != "{")
			return [tokens[begin]];
		if(tokens[begin].closed != true)
			return [];
		
		var bc = 1;
		var res = [tokens[begin]];
		
		for(var i = begin+1; i < tokens.length; i++) {
			if(tokens[i].object == "{")
				bc++;
			else if(tokens[i].object == "}") {
				bc--;
				if(bc == 0) {
					res.push(tokens[i]);
					return res;
				}
			}
			res.push(tokens[i]);
		}
		
		return [];
	},
	
	finish: function(str) {
		return str;
	},
	
	parse_str: function(str, cursorpos) {
		var bracketstack = [];
		var tokens = this.tokenize(str);
		
		var carettrace = 0;
		
		for(var i = 0; i < tokens.length; i++) {
			if(tokens[i].object == "{") {
				bracketstack.push(i);
			}else if(tokens[i].object == "}" && bracketstack.length > 0) {
				tokens[bracketstack[bracketstack.length-1]].closed = true;
				tokens[i].closed = true;
				bracketstack.pop();
			}
			
			if(cursorpos > carettrace && cursorpos <= carettrace + tokens[i].object.length)
				tokens[i].caret = cursorpos - carettrace;
			carettrace = carettrace + tokens[i].object.length;
		}
		
		for(var i = 0; i < bracketstack.length; i++)
			tokens[bracketstack[i]].closed = false;
		
		var res = this.parse(tokens);
		//res.text = res.text.replace(/\\/g, "\u200B");
		return res;
	},
	parse_depth:0,
	
	parse: function(tokens) {
		this.parse_depth++;
		
		var res = "";
		var cursorpos = -1;
		
		var decorator_stack = [];
		
		for(var i = 0; i < tokens.length; i++) {
			if(tokens[i].caret != undefined && tokens[i].closed == undefined) {
				if(tokens[i].object != "\\\\" 
				&& tokens[i].object != "\\_" 
				&& tokens[i].object != "\\}" 
				&& tokens[i].object != "\\{"
				&& tokens[i].object != "\\$"
				&& tokens[i].object != "\\^") {
					cursorpos = res.length + tokens[i].caret;
					res = res + tokens[i].object;
					continue;
				}
			}
			
			if(tokens[i].object == "{" || tokens[i].object == "}") {
				console.log("cbracket: ")
				console.log(	tokens[i]);
				if(tokens[i].closed != true)
					res = res + tokens[i].object;
				if(tokens[i].caret != undefined && tokens[i].object == "}") {
					cursorpos = cursorpos + res.length + 1;
				}
			}else {
				if(this.tag(tokens[i])) {
					if(tag_table[tokens[i].object] != undefined) {
						if(tag_table[tokens[i].object].type == "symbol") {
							var val = tag_table[tokens[i].object].value;
							res = res + val;
							if(tokens[i].caret != undefined && cursorpos == -1)
								cursorpos = res.length + val.length - 1;
						}else if(tag_table[tokens[i].object].type == "decorator" && i < tokens.length - 1) {
							var subblock = this.extract_block(tokens, i+1);
							if(subblock.length > 0) {
								sret = this.parse(subblock);
								var subs = tag_table[tokens[i].object].value(sret.text);
								res = res + subs;
								if(sret.caret != -1 && cursorpos == -1) {
									cursorpos = res.length;
								}
								i = i + subblock.length;
							}else {
								res = res + tokens[i].object;
							}
						}else if(tag_table[tokens[i].object].type == "decorator2" && i < tokens.length - 1) {
							var subblock = this.extract_block(tokens, i+1);
							var init_i = i;
							if(subblock.length > 0) {
								i = i + subblock.length;
								var subblock2 = this.extract_block(tokens, i+1);
								if(subblock2.length > 0) {
									var sret1 = this.parse(subblock);
									var sret2 = this.parse(subblock2);
									if(cursorpos == -1)
										cursorpos = sret1.caret + res.length;
									if(cursorpos == -1)
										cursorpos = sret2.caret + res.length;
									var subs = tag_table[tokens[init_i].object].value(sret1.text, sret2.text);
									res = res + subs;
									
									i = i + subblock2.length;
									
									if((sret1.caret != -1 || sret2.caret != -1) && cursorpos == -1) {
										cursorpos = res.length + subs.length + 2;
									}else if(tokens[i].caret != undefined) {
										cursorpos = res.length + subs.length + 1;
										
									}
								}else {
									res = res + tokens[init_i].object;
									i = init_i;
									if(tokens[i + 1].object == "{") {
										tokens[i + 1].closed = undefined;
										console.log(tokens[i + subblock.length]);
										tokens[i + subblock.length].closed = undefined;
									}
									console.log("frac not finished:");
									console.log(tokens);
								}
							}else {
								res = res + tokens[i].object;
							}
						}else
							res = res + tokens[i].object;
					}else {
						res = res + tokens[i].object;
					}
				}else {
					res = res + tokens[i].object;
				}
			}
		}
		this.parse_depth--;
		return {text:res, caret:cursorpos};
	}
}
