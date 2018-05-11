// Planet Fluxus Copyright (C) 2013 Dave Griffiths
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.
///////////////////////////////////////////////////////////////////////////

// a scheme compiler for javascript

var zc = {};

// match up cooresponding bracket to extract sexpr from a string
zc.extract_sexpr = function(pos, str) {
    var ret="";
    var depth=0;
    var count=0;
    for (var i=pos; i<str.length; i++) {
        if (str[i]==="(") {
            depth++;
        } else {
            if (str[i]===")") {
                depth--;
            }
        }
        ret+=str[i];
        if (depth===0) {
            return ret;
        }
        count++;
    }
    return ret;
};

function white_space(s) {
  return /\s/g.test(s);
}

zc.parse_tree = function(str) {
    var state="none";
    var in_quotes=false;
    var in_comment=false;
    var current_token="";
    var ret=[];
    var i=1;
    while (i<str.length) {
        switch (state) {
        case "none": {
            // look for a paren start
            if (i>0 && str[i]==="(") {
                var sexpr=zc.extract_sexpr(i, str);
                ret.push(zc.parse_tree(sexpr));
                i+=sexpr.length-1;
            } else if (!white_space(str[i]) &&
                       str[i]!=")") {
                state="token";
                current_token+=str[i];
                if (str[i]==="\"") in_quotes = true;
                if (str[i]===";") in_comment = true;
            }
        } break;

        case "token": {
            if (in_comment) {
                if (str[i]==="\n") {
                    state="none";
                    in_comment=false;
                }
            }
            else
            {
                if ((in_quotes && str[i]==="\"") ||
                    (!in_quotes &&
                     (str[i]===" " ||
                      str[i]===")" ||
                      str[i]==="\n"))) {
                    state="none";
                    if (in_quotes) {
                        //console.log(current_token);
                        ret.push(current_token+"\"");
                    in_quotes=false;
                    } else {
                        if (current_token!="") {
                            if (current_token=="#t") current_token="true";
                            if (current_token=="#f") current_token="false";
                            ret.push(current_token);
                        }
                    }
                    current_token="";
                } else {
                    if (in_quotes) {
                        current_token+=str[i];
                    } else {
                        switch (str[i]) {
                        case "-":
                            // don't convert - to _ in front of numbers...
                            // (this should be less naive)
                            if (i<str.length-1 &&
                                !zc.char_is_number(str[i])) {
                                current_token+="_";
                            } else {
                                current_token+=str[i];
                            }
                            break;
                        case "?": current_token+="_q"; break;
                        case "!": current_token+="_e"; break;
                        default: current_token+=str[i];
                        }
                    }
                }
            }
        } break;
        }
        i++;
    }
    return ret;
};

zc.car = function(l) { return l[0]; };

zc.cdr = function(l) {
    if (l.length<2) return [];
    var r=[];
    for (var i=1; i<l.length; i++) {
        r.push(l[i]);
    }
    return r;
};

zc.cadr = function(l) {
    return zc.car(zc.cdr(l));
};

zc.caddr = function(l) {
    return zc.car(zc.cdr(zc.cdr(l)));
};

zc.list_map = function(fn, l) {
    var r=[];
    l.forEach(function (i) {
        r.push(fn(i));
    });
    return r;
};

zc.list_contains = function(l,i) {
    return l.indexOf(i) >= 0;
};

zc.sublist = function(l,s,e) {
    var r=[];
    if (e==null) e=l.length;
    for (var i=s; i<e; i++) {
        r.push(l[i]);
    }
    return r;
};

zc.infixify = function(jsfn, args) {
    var cargs = [];
    args.forEach(function(arg) { cargs.push(zc.comp(arg)); });
    return "("+cargs.join(" "+jsfn+" ")+")";
};

zc.check = function(fn,args,min,max) {
    if (args.length<min) {
        zc.to_page("output", fn+" has too few args ("+args+")");
        return false;
    }
    if (max!=-1 && args.length>max) {
        zc.to_page("output", fn+" has too many args ("+args+")");
        return false;
    }
    return true;
};

zc.comp_lambda = function(args) {
    var expr=zc.cdr(args);
    var nexpr=expr.length;
    var last=expr[nexpr-1];
    var eexpr=zc.sublist(expr,0,nexpr-1);
    var lastc="";

    if (zc.car(last)=="cond") {
        lastc=zc.comp_cond_return(zc.cdr(last));
    } else {
        if (zc.car(last)=="if") {
            lastc=zc.comp_if_return(zc.cdr(last));
        } else {
            if (zc.car(last)=="when") {
                lastc=zc.comp_when_return(zc.cdr(last));
            } else {
                lastc="return "+zc.comp(last);
            }
        }
    }

    return "function ("+zc.car(args).join()+")\n"+
        // adding semicolon here
        "{"+zc.list_map(zc.comp,eexpr).join(";\n")+
        "\n"+lastc+"\n}\n";
};

zc.comp_let = function(args) {
    var fargs = zc.car(args);
    largs = [];
    fargs.forEach(function(a) { largs.push(a[0]); });
    return "("+zc.comp_lambda([largs].concat(zc.cdr(args)))+"("+
        zc.list_map(function(a) { return zc.comp(a[1]); },fargs)+" ))\n";
};

zc.comp_cond = function(args) {
    if (zc.car(zc.car(args))==="else") {
        return zc.comp(zc.cdr(zc.car(args)));
    } else {
        return "if ("+zc.comp(zc.car(zc.car(args)))+") {\n"+
            zc.comp(zc.cadr(zc.car(args)))+"\n} else {\n"+
            zc.comp_cond(zc.cdr(args))+"\n}";
    }
};

zc.comp_cond_return = function(args) {
    if (zc.car(zc.car(args))==="else") {
        return "return "+zc.comp(zc.cdr(zc.car(args)));
    } else {
        return "if ("+zc.comp(zc.car(zc.car(args)))+") {\n"+
            "return "+zc.comp(zc.cadr(zc.car(args)))+"\n} else {\n"+
            zc.comp_cond_return(zc.cdr(args))+"\n}";
    }
};

zc.comp_if = function(args) {
    return "if ("+zc.comp(zc.car(args))+") {\n"+
        zc.comp(zc.cadr(args))+"} else {"+
        zc.comp(zc.caddr(args))+"}";
};

zc.comp_if_return = function(args) {
    return "if ("+zc.comp(zc.car(args))+") {\n"+
        "return "+zc.comp(zc.cadr(args))+"} else {"+
        "return "+zc.comp(zc.caddr(args))+"}";
};

zc.comp_when = function(args) {
    return "if ("+zc.comp(zc.car(args))+") {\n"+
        zc.comp(zc.cdr(args))+"}";
};

zc.comp_when_return = function(args) {
    return "if ("+zc.comp(zc.car(args))+") {\n"+
        "return ("+zc.comp_lambda([[]].concat(zc.cdr(args)))+")() }";
};

zc.core_forms = function(fn, args) {
    // core forms
    if (fn == "lambda") if (zc.check(fn,args,2,-1)) return zc.comp_lambda(args);
    if (fn == "if") if (zc.check(fn,args,3,3)) return zc.comp_if(args);
    if (fn == "when") if (zc.check(fn,args,2,-1)) return zc.comp_when(args);
    if (fn == "cond") if (zc.check(fn,args,2,-1)) return zc.comp_cond(args);
    if (fn == "let") if (zc.check(fn,args,2,-1)) return zc.comp_let(args);

    if (fn == "define") {
        // adding semicolon here
        if (zc.check(fn,args,2,-1)) return "var "+zc.car(args)+" = "+zc.comp(zc.cdr(args))+";";
    }

    if (fn == "list") {
        return "["+zc.list_map(zc.comp,args).join(",")+"]";
    }

    if (fn == "begin") {
        return "("+zc.comp_lambda([[]].concat(args))+")()";
    }

    if (fn == "list_ref") {
        if (zc.check(fn,args,2,2)) return zc.comp(zc.car(args))+"["+zc.comp(zc.cadr(args))+"]";
    }

    if (fn == "list_replace") {
        if (zc.check(fn,args,3,3))
            return "(function() {"+
            "var _list_replace="+zc.comp(zc.car(args))+"\n"+
            "_list_replace["+zc.comp(zc.cadr(args))+"]="+
            zc.comp(zc.caddr(args))+";\n"+
            "return _list_replace;\n})()\n";
    }

    // iterative build-list version for optimisation
    if (fn == "build_list") {
        if (zc.check(fn,args,2,2))
            return "(function() {\n"+
            "var _build_list_l="+zc.comp(zc.car(args))+";\n"+
            "var _build_list_fn="+zc.comp(zc.cadr(args))+";\n"+
            "var _build_list_r= Array(_build_list_l);\n"+
            "for (var _build_list_i=0; _build_list_i<_build_list_l; _build_list_i++) {\n"+
            "_build_list_r[_build_list_i]=_build_list_fn(_build_list_i); }\n"+
            "return _build_list_r; })()";
    }

    // iterative fold version for optimisation
    if (fn == "foldl") {
        if (zc.check(fn,args,3,3))
            return "(function() {\n"+
            "var _foldl_fn="+zc.comp(zc.car(args))+";\n"+
            "var _foldl_val="+zc.comp(zc.cadr(args))+";\n"+
            "var _foldl_src="+zc.comp(zc.caddr(args))+";\n"+
            "for (var _foldl_i=0; _foldl_i<_foldl_src.length; _foldl_i++) {\n"+
            "_foldl_val=_foldl_fn(_foldl_src[_foldl_i],_foldl_val); }\n"+
            "return _foldl_val; })()";
    }

    if (fn == "list_q") {
        if (zc.check(fn,args,1,1))
            return "(Object.prototype.toString.call("+
            zc.comp(zc.car(args))+") === '[object Array]')";
    }

    if (fn == "length") {
        if (zc.check(fn,args,1,1)) return zc.comp(zc.car(args))+".length";
    }

    if (fn == "null_q") {
        if (zc.check(fn,args,1,1)) return "("+zc.comp(zc.car(args))+".length==0)";
    }

    if (fn == "not") {
        if (zc.check(fn,args,1,1))
            return "!("+zc.comp(zc.car(args))+")";
    }

    if (fn == "cons") {
        if (zc.check(fn,args,2,2))
            return "["+zc.comp(zc.car(args))+"].concat("+zc.comp(zc.cadr(args))+")";
    }

    if (fn == "append") {
        if (zc.check(fn,args,1,-1)) {
            var r=zc.comp(zc.car(args));
            for (var i=1; i<args.length; i++) {
                r+=".concat("+zc.comp(args[i])+")";
            }
            return r;
        }
    }

    if (fn == "car") {
        if (zc.check(fn,args,1,1))
            return zc.comp(zc.car(args))+"[0]";
    }

    if (fn == "cadr") {
        if (zc.check(fn,args,1,1))
            return zc.comp(zc.car(args))+"[1]";
    }

    if (fn == "caddr") {
        if (zc.check(fn,args,1,1))
            return zc.comp(zc.car(args))+"[2]";
    }

    if (fn == "cdr") {
        if (zc.check(fn,args,1,1))
            return "zc.sublist("+zc.comp(zc.car(args))+",1)";
    }

    if (fn == "eq_q") {
        if (zc.check(fn,args,2,2))
            return zc.comp(zc.car(args))+"=="+
            zc.comp(zc.cadr(args));
    }


    var infix = [["+","+"],
                 ["-","-"],
                 ["*","*"],
                 ["/","/"],
                 ["%","%"],
                 ["<","<"],
                 [">",">"],
                 ["<=","<="],
                 [">=",">="],
                 ["=","=="],
                 ["and","&&"],
                 ["or","||"],
                 ["modulo","%"]];

    for (var i=0; i<infix.length; i++) {
        if (fn == infix[i][0]) return zc.infixify(infix[i][1],args);
    }

    if (fn == "set_e") {
        if (zc.check(fn,args,2,2))
            return zc.comp(zc.car(args))+"="+zc.comp(zc.cadr(args));
    }

    if (fn == "try") {
        if (zc.check(fn,args,2,2))
            return "try {"+zc.comp(zc.car(args))+"} catch (e) { "+zc.comp(zc.cadr(args))+" }";
    }

    // js intrinsics
    if (fn == "js") {
        if (zc.check(fn,args,1,1)) {
            var v=zc.car(args);
            // remove the quotes to insert the literal string
            return v.substring(1,v.length-1);
        }
    }

    if (fn == "new") {
        return "new "+zc.car(args)+"( "+zc.comp(zc.cadr(args))+")";
    }

    return false;
};

zc.char_is_number = function(c) {
    switch (c) {
        case "0": return true; break;
        case "1": return true; break;
        case "2": return true; break;
        case "3": return true; break;
        case "4": return true; break;
        case "5": return true; break;
        case "6": return true; break;
        case "7": return true; break;
        case "8": return true; break;
        case "9": return true; break;
    }
    return false;
};

zc.is_number = function(str) {
    return zc.char_is_number(str[0]);
};

zc.comp = function(f) {
//    console.log(f);
    try {
        // string, number or list?
        if (typeof f == "string") return f;

        // if null list
        if (f.length==0) return "[]";

        // apply args to function
        if (typeof zc.car(f) == "string") {
            // if it's a number
            if (zc.is_number(zc.car(f))) return zc.car(f);
            if (zc.car(f)[0]=="\"") return zc.car(f);

            var fn=zc.car(f);
            var args=zc.cdr(f);

            // look for a core form
            var r = zc.core_forms(fn,args);
            if (r) return r;

            // fallthrough to outer javascript environment
            return fn+"("+zc.list_map(zc.comp,args).join()+")";
        } else {
            // plain list
            return zc.list_map(zc.comp,f).join("\n");
        }
    } catch (e) {
        zc.to_page("output", "An error in parsing occured on "+f.toString());
        zc.to_page("output", e);
        zc.to_page("output", e.stack);
        return "";
    }
};

zc.compile_code = function(scheme_code) {
    var parse_tree=zc.parse_tree("("+scheme_code+")");
//    alert(JSON.stringify(do_syntax(parse_tree)));
    return zc.comp(do_syntax(parse_tree));
};


zc.compile_code_unparsed = function(scheme_code) {
    var parse_tree=zc.parse_tree("("+scheme_code+")");
    return zc.comp(parse_tree);
};

zc.load = function(url) {
    var xmlHttp = new XMLHttpRequest();
    xmlHttp.open( "GET", url, false );
    xmlHttp.send( null );
    var str=xmlHttp.responseText;
    return "\n/////////////////// "+url+"\n"+zc.compile_code(str)+"\n";
};

zc.load_unparsed = function(url) {
    var xmlHttp = new XMLHttpRequest();
    xmlHttp.open( "GET", url, false );
    xmlHttp.send( null );
    var str=xmlHttp.responseText;
    return "\n/////////////////// "+url+"\n"+zc.compile_code_unparsed(str)+"\n";
};


zc.to_page = function(id,html)
{
    var div=document.createElement("div");
    div.id = "foo";
    div.innerHTML = html;
    document.getElementById(id).appendChild(div);
    console.log(html);
};

function init() {

    jQuery(document).ready(function($) {

        // load and compile the syntax parser
        var syntax_parse=zc.compile_code_unparsed(';; -*- mode: scheme; -*-\n\
;; Planet Fluxus Copyright (C) 2013 Dave Griffiths\n\
;;\n\
;; This program is free software: you can redistribute it and/or modify\n\
;; it under the terms of the GNU Affero General Public License as\n\
;; published by the Free Software Foundation, either version 3 of the\n\
;; License, or (at your option) any later version.\n\
;;\n\
;; This program is distributed in the hope that it will be useful,\n\
;; but WITHOUT ANY WARRANTY; without even the implied warranty of\n\
;; MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the\n\
;; GNU Affero General Public License for more details.\n\
;;\n\
;; You should have received a copy of the GNU Affero General Public License\n\
;; along with this program.  If not, see <http://www.gnu.org/licenses/>.\n\
\n\
;; todo make data-driven and make define-syntax!\n\
(define ret (lambda (code)\n\
  (cond\n\
   ((not (list? code)) code)\n\
   ((null? code) ())\n\
\n\
   ;; with-state\n\
   ((eq? (car code) "with_state")\n\
    (append\n\
     (list "begin" (list "push"))\n\
      (list (list "let"\n\
                  (list (list "r" (append (list "begin") (do-syntax (cdr code)))))\n\
                  (list "pop") "r"))))\n\
\n\
   ;; with-primitive\n\
   ((eq? (car code) "with_primitive")\n\
    (append\n\
     (list "begin" (list "grab" (cadr code)))\n\
     (list (list "let"\n\
                 (list (list "r" (append (list "begin") (do-syntax (cdr code)))))\n\
                 (list "ungrab") "r"))))\n\
\n\
   ((eq? (car code) "every_frame")\n\
    (append\n\
     (list "every_frame_impl")\n\
     (list\n\
      (list "lambda" (list)\n\
            (do-syntax (cdr code))))))\n\
\n\
\n\
   ;; define a function\n\
   ((and\n\
     (eq? (car code) "define")\n\
     (list? (cadr code)))\n\
    (let ((name (car (cadr code)))\n\
          (args (cdr (cadr code)))\n\
          (body (do-syntax (cdr (cdr code)))))\n\
      (list "define" name (append (list "lambda" args) body))))\n\
\n\
   (else (cons (do-syntax (car code))\n\
               (do-syntax (cdr code)))))))\n\
\n\
ret\n\
');
        try {
            //console.log(syntax_parse);
            do_syntax=eval(syntax_parse);
        } catch (e) {
            zc.to_page("output", "An error occured parsing syntax of "+syntax_parse);
            zc.to_page("output",e);
            zc.to_page("output",e.stack);
        }

        var js=zc.compile_code(';; -*- mode: scheme; -*-\n\
;; Planet Fluxus Copyright (C) 2013 Dave Griffiths\n\
;;\n\
;; This program is free software: you can redistribute it and/or modify\n\
;; it under the terms of the GNU Affero General Public License as\n\
;; published by the Free Software Foundation, either version 3 of the\n\
;; License, or (at your option) any later version.\n\
;;\n\
;; This program is distributed in the hope that it will be useful,\n\
;; but WITHOUT ANY WARRANTY; without even the implied warranty of\n\
;; MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the\n\
;; GNU Affero General Public License for more details.\n\
;;\n\
;; You should have received a copy of the GNU Affero General Public License\n\
;; along with this program.  If not, see <http://www.gnu.org/licenses/>.\n\
\n\
(define zero?\n\
  (lambda (n)\n\
    (= n 0)))\n\
\n\
(define (random n)\n\
  (Math.floor (* (Math.random) n)))\n\
\n\
(define (rndf) (Math.random))\n\
\n\
(define (floor n) (Math.floor n))\n\
\n\
;; replaced by underlying iterative version\n\
;;(define foldl\n\
;;  (lambda (fn v l)\n\
;;    (cond\n\
;;     ((null? l) v)\n\
;;     (else (foldl fn (fn (car l) v) (cdr l))))))\n\
\n\
(define map\n\
  (lambda (fn l)\n\
    (foldl\n\
     (lambda (i r)\n\
       (append r (list (fn i))))\n\
     ()\n\
     l)))\n\
\n\
(define filter\n\
  (lambda (fn l)\n\
    (foldl\n\
     (lambda (i r)\n\
       (if (fn i) (append r (list i)) r))\n\
     ()\n\
     l)))\n\
\n\
(define for-each\n\
  (lambda (fn l)\n\
    (foldl\n\
     (lambda (i r)\n\
       (fn i))\n\
     ()\n\
     l)\n\
    #f))\n\
\n\
(define display (lambda (str) (console.log str)))\n\
\n\
(define newline (lambda () 0))\n\
\n\
(define list-equal?\n\
  (lambda (a b)\n\
    (define _\n\
      (lambda (a b)\n\
        (cond\n\
         ((null? a) #t)\n\
         ((not (eq? (car a) (car b))) #f)\n\
         (else (_ (cdr a) (cdr b))))))\n\
    (if (eq? (length a) (length b))\n\
        (_ a b) #f)))\n\
\n\
;; replaced by js version\n\
;;(define build-list\n\
;;  (lambda (n fn)\n\
;;    (define _\n\
;;      (lambda (i)\n\
;;        (cond\n\
;;         ((eq? i (- n 1)) ())\n\
;;         (else\n\
;;          (cons (fn n) (_ (+ i 1) fn))))))\n\
;;    (_ 0)))\n\
\n\
(define print-list\n\
  (lambda (l)\n\
    (when (not (null? l))\n\
          (console.log (car l))\n\
          (print-list (cdr l)))))\n\
\n\
(define factorial\n\
  (lambda (n)\n\
    (if (= n 0) 1\n\
        (* n (factorial (- n 1))))))\n\
\n\
(define a 0)\n\
\n\
(define unit-test\n\
  (lambda ()\n\
    (display "unit tests running...")\n\
    (set! a 10)\n\
    (when (not (eq? 4 4)) (display "eq? failed"))\n\
    (when (eq? 2 4) (display "eq?(2) failed"))\n\
    (when (not (eq? (car (list 3 2 1)) 3)) (display "car failed"))\n\
    (when (not (eq? (cadr (list 3 2 1)) 2)) (display "cadr failed"))\n\
    (when (not (eq? (caddr (list 3 2 1)) 1)) (display "caddr failed"))\n\
\n\
    (when (not (eq? (begin 1 2 3) 3)) (display "begin failed"))\n\
    (when (not (eq? (list-ref (list 1 2 3) 2) 3)) (display "list-ref failed"))\n\
    (when (not (list? (list 1 2 3))) (display "list? failed"))\n\
    (when (list? 3) (display "list?(2) failed"))\n\
    (when (null? (list 1 2 3)) (display "null? failed"))\n\
    (when (not (null? (list))) (display "null?(2) failed"))\n\
    (when (not (eq? (length (list 1 2 3 4)) 4)) (display "length failed"))\n\
    (when (not (list-equal? (list 1 2 3 4) (list 1 2 3 4))) (display "list-equal failed"))\n\
    (when (list-equal? (list 1 2 3 4) (list 1 4 3 4)) (display "list-equal(2) failed"))\n\
    (when (not (list-equal? (append (list 1 2 3) (list 4 5 6)) (list 1 2 3 4 5 6)))\n\
          (display "append failed"))\n\
    (when (not (list-equal? (cdr (list 3 2 1)) (list 2 1))) (display "cdr failed"))\n\
    (when (not (list-equal? (cons 1 (list 2 3)) (list 1 2 3))) (display "cons failed"))\n\
    (when (not (eq? (foldl (lambda (a r) (+ a r)) 0 (list 1 2 1 1)) 5))\n\
          (display "fold failed"))\n\
    (when (not (list-equal? (map (lambda (i) (+ i 1)) (list 1 2 3 4)) (list 2 3 4 5)))\n\
          (display "map failed"))\n\
    (when (not (eq? (let ((a 1) (b 2) (c 3)) (+ a b c)) 6)) (display "let failed"))\n\
    (when (not (eq? (let ((a 1) (b 2) (c 3)) (list 2 3) (+ a b c)) 6)) (display "let(2) failed"))\n\
    (when (not (eq? a 10)) (display "set! failed"))\n\
    (when (not (eq? (factorial 10) 3628800)) (display "factorial test failed"))\n\
    (when (not (eq? (list-ref (list-replace (list 1 2 3) 2 4) 2) 4)) (display "list-replace failed"))\n\
    (when (not (list-equal? (build-list 10 (lambda (n) n)) (list 0 1 2 3 4 5 6 7 8 9)))\n\
          (display "build-list failed"))\n\
    (when (eq? (not (+ 200 3)) 203) (display "+ failed"))\n\
    ))\n\
\n\
(unit-test)\n\
');
        js+=zc.compile_code(';; -*- mode: scheme; -*-\n\
;; little canvas engine\n\
;; (C) 2013 David Griffiths\n\
;; GPL Affero etc\n\
\n\
(js "; $.ajaxSetup ({\n\
    cache: false\n\
})")\n\
\n\
(define (server-call name argsl)\n\
  ;; hack together a js object to send\n\
   (define args\n\
    (foldl\n\
     (lambda (i r)\n\
       (js "r[i[0]]=i[1]")\n\
       r)\n\
     (js "{}")\n\
     argsl))\n\
  (set! args.function_name name)\n\
  (console.log args)\n\
  (let ((v ($.get "game" args)))\n\
    (v.fail (lambda (jqXHR textStatus errorThrown)\n\
              (console.log textStatus)\n\
              (console.log errorThrown)))))\n\
\n\
 (define (server-call-mutate name argsl f)\n\
   ;; hack together a js object to send\n\
   (define args\n\
    (foldl\n\
     (lambda (i r)\n\
       (js "r[i[0]]=i[1]")\n\
       r)\n\
     (js "{}")\n\
     argsl))\n\
  (set! args.function_name name)\n\
  (console.log args)\n\
  (let ((v ($.get "game" args (mutate-game f))))\n\
    (v.fail (lambda (jqXHR textStatus errorThrown)\n\
              (console.log textStatus)\n\
              (console.log errorThrown)))))\n\
\n\
\n\
(define (choose l)\n\
  (list-ref l (random (length l))))\n\
\n\
(define (delete-n l n)\n\
  (if (eq? n 0)\n\
      (cdr l)\n\
      (append (list (car l)) (delete-n (cdr l) (- n 1)))))\n\
\n\
(define shuffle\n\
  (lambda (l)\n\
    (if (< (length l) 2)\n\
        l\n\
        (let ((item (random (length l))))\n\
          (cons (list-ref l item)\n\
                (shuffle (delete-n l item)))))))\n\
\n\
(define (crop l n)\n\
  (cond\n\
   ((null? l) ())\n\
   ((zero? n) ())\n\
   (else (cons (car l) (crop (cdr l) (- n 1))))))\n\
\n\
(define (transform x y r s) (list x y r s))\n\
\n\
(define (transform-x t) (list-ref t 0))\n\
(define (transform-y t) (list-ref t 1))\n\
\n\
(define (play-sound sound)\n\
 (let ((snd (new Audio sound)))\n\
    (snd.play)))\n\
\n\
(define image-lib ())\n\
\n\
(define (load-image-mutate fn filename)\n\
  (let ((image (js "new Image()")))\n\
    (set! image.onload\n\
          (mutate-game\n\
           (lambda (c)\n\
             (set! image-lib (cons (list filename image) image-lib))\n\
             (fn c))))\n\
    (set! image.src (+ "images/" filename))))\n\
\n\
(define (load-image! fn finished images)\n\
  (let ((image (js "new Image()")))\n\
    (set! image.onload\n\
          (lambda ()\n\
            ;;(console.log (+ "loaded " (+ "images/" fn)))\n\
            (set! image-lib (cons (list fn image) image-lib))\n\
            (ctx.clearRect 0 0 screen-width screen-height)\n\
            (set! ctx.font "normal 75pt effra")\n\
            (centre-text ctx "Loading..." 240)\n\
            (centre-text\n\
             ctx\n\
             (+ "" (Math.floor (* (/ (length image-lib)\n\
                                     (length images)) 100)) "%")  340)\n\
            (when (eq? (length image-lib)\n\
                       (length images))\n\
                  (finished))))\n\
;;    (console.log (+ "loading " (+ "images/" fn)))\n\
    (set! image.src (+ "images/" fn))))\n\
\n\
(define (load-images! l finished)\n\
  (for-each\n\
   (lambda (fn)\n\
     (load-image! fn finished l))\n\
   l))\n\
\n\
(define (find-image fn l)\n\
  (cond\n\
   ((null? l) #f)\n\
   ((eq? (car (car l)) fn) (cadr (car l)))\n\
   (else (find-image fn (cdr l)))))\n\
\n\
;; ----------------------------------------\n\
\n\
(define (centre-text ctx txt y)\n\
  (let ((m (ctx.measureText txt)))\n\
    (ctx.fillText txt (- (/ screen-width 2) (/ m.width 2)) y)))\n\
\n\
(define (left-text ctx txt x y)\n\
  (ctx.fillText txt x y))\n\
\n\
(define (wrap-text ctx text x y max-width line-height)\n\
  (define x-pos 0)\n\
  (define (wrap-text-inner words line y)\n\
    (if (null? words)\n\
	(begin\n\
	  (when (zero? x-pos)\n\
		(let ((m (ctx.measureText line)))\n\
		  (set! x-pos (- (/ screen-width 2) (/ m.width 2)))))\n\
	  (left-text ctx line x-pos y))\n\
	(begin\n\
	  (let ((test-line (+ line (car words) " ")))\n\
	    (let ((metrics (ctx.measureText test-line)))\n\
	      (if (> metrics.width max-width)\n\
		  (begin\n\
		    ;; todo cond returning too early...\n\
		    (when (zero? x-pos)\n\
			  (let ((m (ctx.measureText line)))\n\
			    (set! x-pos (- (/ screen-width 2) (/ m.width 2)))))\n\
		    \n\
		    (left-text ctx line x-pos y)\n\
		    (wrap-text-inner (cdr words)\n\
				     (+ (car words) " ")\n\
				     (+ y line-height)))\n\
		  (begin\n\
		    (wrap-text-inner\n\
		     (cdr words) test-line y))))))))\n\
  (wrap-text-inner (text.split " ") "" y))\n\
\n\
(define (text-max-width ctx text wrap-width)\n\
  (let ((ret 0))\n\
    (define (_ words line)\n\
      (if (null? words)\n\
	  (begin\n\
	    (let ((m (ctx.measureText line)))\n\
	      (when (> m.width ret) (set! ret m.width))))\n\
	  (begin\n\
	    (let ((test-line (+ line (car words) " ")))\n\
	      (let ((metrics (ctx.measureText test-line)))\n\
		(if (> metrics.width wrap-width)\n\
		    (begin\n\
		      (let ((m (ctx.measureText line)))\n\
			(when (> m.width ret) (set! ret m.width)))\n\
		      (_ (cdr words) (+ (car words) " ")))\n\
		    (begin\n\
		      (when (> metrics.width ret) (set! ret metrics.width))\n\
		      (_ (cdr words) test-line))))))))\n\
    (_ (text.split " ") "")\n\
    ret))\n\
\n\
(define (multitext-max-width ctx text wrap-width)\n\
  (let ((ret 0))\n\
    (for-each\n\
     (lambda (text)\n\
       (let ((w (text-max-width ctx text wrap-width)))\n\
	 (when (> w ret) (set! ret w))))\n\
     text)\n\
    ret))\n\
\n\
(define (wrap-multitext-slow ctx text x y max-width line-height)\n\
  (define x-pos 0)\n\
  (define y-pos 0)\n\
  (set! y-pos y)\n\
  (define (wrap-multitext-slow-inner words line)\n\
    (if (null? words)\n\
	(begin\n\
	  (left-text ctx line x-pos y-pos))\n\
	(begin\n\
	  (let ((test-line (+ line (car words) " ")))\n\
	    (let ((metrics (ctx.measureText test-line)))\n\
	      (if (> metrics.width max-width)\n\
		  (begin\n\
		    ;; todo cond returning too early...\n\
		    (left-text ctx line x-pos y-pos)\n\
		    (set! y-pos (+ y-pos line-height))\n\
		    (wrap-multitext-slow-inner (cdr words)\n\
				     (+ (car words) " ")))\n\
		  (begin\n\
		    (wrap-multitext-slow-inner\n\
		     (cdr words) test-line))))))))\n\
\n\
  (set! x-pos (- (/ screen-width 2) (/ (multitext-max-width ctx text max-width) 2)))\n\
  (for-each\n\
   (lambda (text)\n\
     (wrap-multitext-slow-inner (text.split " ") "")\n\
     (set! y-pos (+ y-pos line-height)))\n\
   text))\n\
\n\
\n\
(define (wrap-multitext ctx text x y max-width line-height)\n\
  (define x-pos 0)\n\
  (define y-pos 0)\n\
  (set! y-pos y)\n\
  (define (wrap-multitext-inner words line)\n\
    (if (null? words)\n\
	(begin\n\
	  (when (zero? x-pos)\n\
		(let ((m (ctx.measureText line)))\n\
		  (set! x-pos (- (/ screen-width 2) (/ m.width 2)))))\n\
	  (left-text ctx line x-pos y-pos))\n\
	(begin\n\
	  (let ((test-line (+ line (car words) " ")))\n\
	    (let ((metrics (ctx.measureText test-line)))\n\
	      (if (> metrics.width max-width)\n\
		  (begin\n\
		    ;; todo cond returning too early...\n\
		    (when (zero? x-pos)\n\
			  (let ((m (ctx.measureText line)))\n\
			    (set! x-pos (- (/ screen-width 2) (/ m.width 2)))))\n\
		    \n\
		    (left-text ctx line x-pos y-pos)\n\
		    (set! y-pos (+ y-pos line-height))\n\
		    (wrap-multitext-inner (cdr words)\n\
				     (+ (car words) " ")))\n\
		  (begin\n\
		    (wrap-multitext-inner\n\
		     (cdr words) test-line))))))))\n\
  (for-each\n\
   (lambda (text)\n\
     (wrap-multitext-inner (text.split " ") "")\n\
     (set! y-pos (+ y-pos line-height)))\n\
   text))\n\
\n\
(define (sprite x y image timer)\n\
  (list x y image timer))\n\
\n\
(define (sprite-x s) (list-ref s 0))\n\
(define (sprite-y s) (list-ref s 1))\n\
(define (sprite-modify-x s v) (list-replace s 0 v))\n\
(define (sprite-modify-y s v) (list-replace s 1 v))\n\
(define (sprite-image s) (list-ref s 2))\n\
(define (sprite-timer s) (list-ref s 3))\n\
\n\
(define (sprite-render ctx t s)\n\
  (when (< t (sprite-timer s))\n\
        (ctx.save)\n\
        (ctx.translate (sprite-x s) (sprite-y s))\n\
        (ctx.drawImage\n\
         (find-image (sprite-image s) image-lib)\n\
         0 0)\n\
        (ctx.restore)))\n\
\n\
;; ----------------------------------------\n\
\n\
(define (rect-button name x y w h jitter callback)\n\
      (list "rect-button" name x y w h\n\
            jitter callback #f (rndf)))\n\
\n\
(define (image-button name x y jitter image-name callback)\n\
    (let ((image (find-image image-name image-lib)))\n\
      (list "image-button"\n\
            name x y\n\
            image.width\n\
            image.height\n\
            jitter callback image-name\n\
            (rndf))))\n\
\n\
(define (circle-button name x y r callback)\n\
  (list "circle-button" name x y r r #f callback #f (rndf)))\n\
\n\
(define (button-type b) (list-ref b 0))\n\
(define (button-name b) (list-ref b 1))\n\
(define (button-x b) (list-ref b 2))\n\
(define (button-y b) (list-ref b 3))\n\
(define (button-w b) (list-ref b 4))\n\
(define (button-r b) (list-ref b 4))\n\
(define (button-h b) (list-ref b 5))\n\
(define (button-jitter b) (list-ref b 6))\n\
(define (button-callback b) (list-ref b 7))\n\
(define (button-image b) (list-ref b 8))\n\
(define (button-offs b) (list-ref b 9))\n\
\n\
(define (dist-2d x1 y1 x2 y2)\n\
  (let ((x (- x2 x1))\n\
        (y (- y2 y1)))\n\
    (Math.sqrt (+ (* x x) (* y y)))))\n\
\n\
(define (in-rect? x y w h xx yy)\n\
  (and (> xx x)\n\
       (< xx (+ x w))\n\
       (> yy y)\n\
       (< yy (+ y h))))\n\
\n\
(define (in-circle? x y r xx yy)\n\
  (< (dist-2d xx yy x y) r))\n\
\n\
(define (rect-button-update! b mx my c)\n\
  (if (in-rect? (button-x b) (button-y b)\n\
                (button-w b) (button-h b)\n\
                mx my)\n\
      (let ((fn (button-callback b)))\n\
        (list #t (fn c)))\n\
      (list #f c)))\n\
\n\
(define (circle-button-update! b mx my c)\n\
  (if (in-circle? (button-x b) (button-y b)\n\
                  (button-r b) mx my)\n\
      (let ((fn (button-callback b)))\n\
        (list #t (fn c)))\n\
      (list #f c)))\n\
\n\
(define (button-update! b mx my c)\n\
  (cond\n\
   ((eq? (button-type b) "rect-button")\n\
    (rect-button-update! b mx my c))\n\
   ((eq? (button-type b) "image-button")\n\
    (rect-button-update! b mx my c))\n\
   (else\n\
    (circle-button-update! b mx my c))))\n\
\n\
(define (rect-button-render! ctx t b)\n\
  (when #f\n\
        (ctx.save)\n\
        (ctx.translate (button-x b) (button-y b))\n\
        (when (button-jitter b)\n\
              (ctx.translate (/ (button-w b) 2)\n\
                             (/ (button-h b) 2))\n\
              (ctx.rotate (* 0.2 (- (rndf) 0.5)))\n\
              (ctx.scale (+ 1 (* 0.2 (- (rndf) 0.5)))\n\
                         (+ 1 (* 0.2 (- (rndf) 0.5))))\n\
              (ctx.translate (- 0 (/ (button-w b) 2))\n\
                       (- 0 (/ (button-h b) 2))))\n\
\n\
        (set! ctx.strokeStyle "#fff")\n\
        (ctx.strokeRect\n\
         0 0 (button-w b) (button-h b))\n\
        (ctx.fillText (button-name b) (/ (button-w b) 2) (+ 20 (/ (button-h b) 2)))\n\
        (ctx.restore)\n\
        ))\n\
\n\
(define (image-button-render! ctx t b)\n\
  (ctx.save)\n\
  (ctx.translate (button-x b) (button-y b))\n\
  (when (button-jitter b)\n\
        (ctx.translate (/ (button-w b) 2)\n\
                       (/ (button-h b) 2))\n\
        (ctx.rotate (* 0.05 (Math.sin (+ (* (button-offs b) 10) (* t 0.01)))))\n\
        ;;(ctx.scale (+ 1 (* 0.2 (- (rndf) 0.5)))\n\
        ;;           (+ 1 (* 0.2 (- (rndf) 0.5))))\n\
        (ctx.translate (- 0 (/ (button-w b) 2))\n\
                       (- 0 (/ (button-h b) 2))))\n\
\n\
  (ctx.drawImage\n\
   (find-image (button-image b) image-lib)\n\
   0 0)\n\
\n\
  (set! ctx.fillStyle "#221c35")\n\
  (set! ctx.font "bold 45pt effra heavy")\n\
\n\
  (let ((m (ctx.measureText (button-name b))))\n\
    (ctx.fillText\n\
     (button-name b)\n\
     (- (/ (button-w b) 2) (/ m.width 2))\n\
     (+ (/ (button-h b) 2) 20)))\n\
  (ctx.restore))\n\
\n\
\n\
(define (circle-button-render! ctx t b)\n\
  (ctx.beginPath)\n\
  (ctx.arc (button-x b) (button-y b)\n\
           (button-r b) 0 (* Math.PI 2) true)\n\
  (ctx.closePath)\n\
  (set! ctx.strokeStyle "#fff")\n\
  (ctx.stroke))\n\
\n\
(define (button-render! ctx t b)\n\
  (cond\n\
   ((eq? (button-type b) "rect-button")\n\
    (rect-button-render! ctx t b))\n\
   ((eq? (button-type b) "image-button")\n\
    (image-button-render! ctx t b))\n\
   (else\n\
    (circle-button-render! ctx t b))))\n\
\n\
;; ----------------------------------------\n\
\n\
(define (button-list b)\n\
  b)\n\
\n\
(define (button-inner-update b mx my c)\n\
  (foldl\n\
   (lambda (b r)\n\
     (if (not (car r)) ;; if event not handled\n\
         (button-update! b mx my (cadr r))\n\
         (js "r")))\n\
   (list #f c)\n\
   b))\n\
\n\
(define (buttons-update b mx my c)\n\
  (let ((r (button-inner-update b mx my c)))\n\
    (cadr r)))\n\
\n\
(define (buttons-render! ctx t b)\n\
  (for-each\n\
   (lambda (b)\n\
     (button-render! ctx t b))\n\
   b))\n\
\n\
;; ----------------------------------------\n\
\n\
(define (make-new-game)\n\
  (list 0\n\
        (lambda (ctx)\n\
          0)\n\
        (lambda (t c)\n\
          c)\n\
        ()\n\
        0\n\
        0\n\
        ()))\n\
\n\
(define (game-time g) (list-ref g 0))\n\
(define (game-modify-time v g) (list-replace g 0 v))\n\
(define (game-render g) (list-ref g 1))\n\
(define (game-modify-render v g) (list-replace g 1 v))\n\
(define (game-update g) (list-ref g 2))\n\
(define (game-modify-update v g) (list-replace g 2 v))\n\
(define (game-buttons g) (list-ref g 3))\n\
(define (game-modify-buttons v g) (list-replace g 3 v))\n\
(define (game-data g) (list-ref g 4))\n\
(define (game-modify-data fn g) (list-replace g 4 (fn (game-data g))))\n\
(define (game-mx g) (list-ref g 5))\n\
(define (game-modify-mx v g) (list-replace g 5 v))\n\
(define (game-my g) (list-ref g 6))\n\
(define (game-modify-my v g) (list-replace g 6 v))\n\
\n\
(define (game-input g mx my)\n\
  (buttons-update (game-buttons g) mx my\n\
                  (game-modify-mx\n\
                   mx (game-modify-my my g))))\n\
\n\
;; ----------------------------------------\n\
\n\
(define timeout-trigger (* 2 60))\n\
(define timeout-time 0)\n\
(define timeout-delta 0)\n\
(define timeout-t (js "new Date()"))\n\
\n\
(define (top-update-game t game)\n\
  (set! timeout-time (+ timeout-time timeout-delta))\n\
  (when (> timeout-time timeout-trigger)\n\
	(window.location.reload))\n\
  (set! timeout-delta (/ (- (js "new Date()") timeout-t) 1000.0))\n\
  (set! timeout-t (js "new Date()"))\n\
  (let ((fn (game-update game)))\n\
    (set! game (game-modify-time\n\
                t (fn t game)))))\n\
\n\
(define (top-render-game ctx game)\n\
  (let ((fn (game-render game)))\n\
    (fn ctx)))\n\
\n\
(define (top-render)\n\
  (when (not (eq? game 0))\n\
        (ctx.clearRect 0 0 screen-width screen-height)\n\
        (let ((t (- (js "new Date()") load-time)))\n\
          (set! ctx.font "bold 10pt courier")\n\
          (set! ctx.fillStyle "#fff");\n\
;;          (ctx.fillText (+ "Time is: " t) 10 750)\n\
          (set! ctx.font "75pt stefanie")\n\
          (top-update-game t game)\n\
          (top-render-game ctx game)\n\
          (buttons-render! ctx t (game-buttons game)))\n\
        (requestAnimFrame top-render ctx)))\n\
\n\
(define game 0)\n\
\n\
(define (mouse-from-event g canvas e)\n\
  (set! timeout-time 0)\n\
  (let ((rect (canvas.getBoundingClientRect)))\n\
    (let ((sx (/ rect.width screen-width))\n\
          (sy (/ rect.height screen-height)))\n\
      (list (/ (- e.clientX rect.left) sx)            \n\
            (/ (- e.clientY rect.top) sy)))))\n\
\n\
(define (touch-from-event g canvas e)\n\
  (set! timeout-time 0)\n\
  (let ((e (car e.targetTouches)))\n\
    (mouse-from-event g canvas e)))\n\
\n\
(define touchscreen 0)\n\
\n\
(define (start-game canvas ctx)\n\
  (ctx.clearRect 0 0 screen-width screen-height)\n\
\n\
  (canvas.addEventListener\n\
   "mousedown"\n\
   (lambda (e)\n\
     (when (zero? touchscreen)\n\
           (let ((m (mouse-from-event game canvas e)))\n\
             (set! game (game-input game (car m) (cadr m)))))))\n\
\n\
  (canvas.addEventListener\n\
   "touchstart"\n\
   (lambda (e)\n\
     (e.preventDefault)\n\
     (set! touchscreen 1)\n\
     (let ((m (touch-from-event game canvas e)))\n\
       (set! game (game-input game (car m) (cadr m))))))\n\
\n\
\n\
  (console.log "building game")\n\
  ;; todo - pass in game specific func\n\
  (set! game (nightjar-intro (make-new-game)))\n\
  (requestAnimFrame top-render ctx))\n\
\n\
(define (mutate-game f)\n\
  (lambda (data)\n\
    (set! game (f game data))))\n\
\n\
;; ----------------------------------------\n\
\n\
(console.log "started nightjar game")\n\
\n\
(define canvas (document.getElementById "canvas"))\n\
(define ctx (canvas.getContext "2d"))\n\
\n\
;(define screen-width 1024)\n\
;(define screen-height 768)\n\
(define screen-width 1774)\n\
(define screen-height 998)\n\
\n\
\n\
(define load-time (js "new Date()"))\n\
\n\
(set! ctx.fillStyle "#fff")\n\
(set! ctx.strokeStyle "#000")\n\
\n\
');
        js+=zc.compile_code(';; -*- mode: scheme; -*-\n\
; ------------------------------------------------\n\
; nightjar specific stuff\n\
\n\
(js ";")\n\
\n\
(define bg-col "#221d35") \n\
(define highlight-col "#f5dc6e")\n\
(define default-button-x (- (/ screen-width 2) 350))\n\
(define default-button-y (+ (/ screen-height 2) 200))\n\
(define button-gap 250)\n\
(define game-time-allowed 15)\n\
\n\
(define filenames\n\
  (list\n\
   "Reflectance_CF003_V_rgb_0.46-r.jpg"\n\
   "Reflectance_CF004_V_rgb_0.63-r.jpg"\n\
   "Reflectance_CF005_V_rgb_0.53-r.jpg"\n\
   "Reflectance_CF006_V_rgb_0.57-r.jpg"\n\
   "Reflectance_CF007_V_rgb_0.61-r.jpg"\n\
   "Reflectance_CF008_V_rgb_0.41-r.jpg"\n\
   "Reflectance_CF009_V_rgb_0.69-r.jpg"\n\
   "Reflectance_CF010_V_rgb_0.49-r.jpg"\n\
   "Reflectance_CF011_V_rgb_0.43-r.jpg"\n\
   "Reflectance_CF012_V_rgb_0.41-r.jpg"\n\
   "Reflectance_CF013_V_rgb_0.56-r.jpg"\n\
   "Reflectance_CF014_V_rgb_0.67-r.jpg"\n\
   "Reflectance_CF015_V_Rgb_0.65-r.jpg"\n\
   "Reflectance_CF017_V_rgb_0.54-r.jpg"\n\
   "Reflectance_CF020_V_rgb_0.47-r.jpg"\n\
   "Reflectance_CF021_V_rgb_0.52-r.jpg"\n\
   "Reflectance_CF022_V_rgb_0.52-r.jpg"\n\
   "Reflectance_CF024_V_rgb_0.57-r.jpg"\n\
   "Reflectance_CF025_V_rgb_0.33-r.jpg"\n\
   "Reflectance_CF026_V_rgb_0.55-r.jpg"\n\
   "Reflectance_CF027_V_rgb_0.45-r.jpg"\n\
   "Reflectance_CF028_V_rgb_0.55-r.jpg"\n\
   "Reflectance_CF030_V_rgb_0.47-r.jpg"\n\
   "Reflectance_CF032_V_rgb_0.58-r.jpg"\n\
   "Reflectance_CF035_V_rgb_0.50-r.jpg"\n\
   "Reflectance_CF036_V_rgb_0.48-r.jpg"\n\
\n\
   "Reflectance_CP005_V_rgb_0.62-r.jpg"\n\
   "Reflectance_CP007_V_rgb_0.40-r.jpg"\n\
   "Reflectance_CP011_V_rgb_0.58-r.jpg"\n\
   "Reflectance_CP014_V_rgb_0.36-r.jpg"\n\
   "Reflectance_CP017_V_rgb_0.52-r.jpg"\n\
   "Reflectance_CP018_V_Rgb_0.55-r.jpg"\n\
   "Reflectance_CP020_V_rgb_0.44-r.jpg"\n\
   "Reflectance_CP031_V_rgb_0.25-r.jpg"\n\
\n\
   "Reflectance_MV002_V_rgb_0.54-r.jpg"\n\
   "Reflectance_MV004_V_rgb_0.40-r.jpg"\n\
   "Reflectance_MV005_V_rgb_0.55-r.jpg"\n\
   "Reflectance_MV006_V_rgb_0.44-r.jpg"\n\
   "Reflectance_MV007_V_rgb_0.49-r.jpg"))\n\
\n\
;;(set! filenames\n\
;;      (filenames.concat\n\
;;       (map\n\
;;        (lambda (fn)\n\
;;          (+ "mongoose-" fn))\n\
;;        filenames)))\n\
\n\
(define photos\n\
  (map\n\
   (lambda (fn)\n\
     (+ "photos/" fn))\n\
   filenames))\n\
\n\
(define (feather)\n\
  (choose (list "feather1.png" "feather2.png" "feather3.png")))\n\
\n\
(define left-feather "feather-white-4.png")\n\
(define right-feather "feather-white-3.png")\n\
\n\
(define (nightjar-example file pos width height)\n\
  (list file pos width height))\n\
\n\
(define (nightjar-example-file n) (list-ref n 0))\n\
(define (nightjar-example-pos n) (list-ref n 1))\n\
(define (nightjar-example-width n) (list-ref n 2))\n\
(define (nightjar-example-height n) (list-ref n 3))\n\
\n\
;; get from image structure\n\
(define image-width 2474)\n\
(define image-height 1640)\n\
(define image-centre-x (/ image-width 2))\n\
(define image-centre-y (/ image-height 2))\n\
\n\
(define positions\n\
  (list\n\
   (list 932 790 454 134)\n\
   (list 981 818 378 92)\n\
   (list 904 768 465 139)\n\
   (list 904 763 476 144)\n\
   (list 1030 778 546 156)\n\
   (list 917 751 488 157)  ;;  cf08\n\
   (list 1008 766 328 119)\n\
   (list 1153 783 466 119)\n\
   (list 1095 763 406 118)\n\
   (list 910 752 480 154)\n\
   (list 1112 738 536 174) ;;  cf014\n\
   (list 1093 773 423 114)\n\
   (list 1140 766 332 133)\n\
   (list 1077 743 345 110)\n\
   (list 1126 738 354 129)\n\
   (list 1075 761 259 101)\n\
   (list 1108 775 369 98)\n\
   (list 1047 783 351 103)\n\
   (list 1016 721 422 166)\n\
   (list 1000 766 405 132) ;;   cf26\n\
   (list 1133 755 331 125)\n\
   (list 1025 773 350 118)\n\
   (list 1150 777 326 110)\n\
   (list 1100 754 352 111)\n\
   (list 1053 782 294 104)\n\
   (list 1058 798 308 92)\n\
   (list 1130 802 400 131)\n\
   (list 963 751 449 133)\n\
   (list 1059 766 505 156)\n\
   (list 922 750 551 133)\n\
   (list 994 740 408 167)\n\
   (list 1091 779 408 119)\n\
   (list 1151 717 342 126)\n\
   (list 996 768 372 129)\n\
   (list 970 753 387 129);;   mv02\n\
   (list 1122 746 423 157);;  mv04\n\
   (list 989 773 332 118)\n\
   (list 936 764 447 173)\n\
   (list 984 702 408 180)))\n\
\n\
(define scores\n\
  (list 778.15 1179.35 1360.7 1508.25 1651.25 1778.2 1890.65 1986.65 \n\
	2079.4 2160.63157894737 2252.15 2343.15 2426 2506.17647058824 \n\
	2579.15 2649.6 2714.94736842105 2777.05 2848.21052631579 \n\
	2904.26315789474 2954.55555555556 3016.1 3073.7 3135.7 \n\
	3199.61111111111 3259.25 3313.84615384615 3377.42105263158 3431.7 \n\
	3490.41176470588 3543.68421052632 3597.57894736842 3659.10526315789 \n\
	3714.4 3765.5 3817.15789473684 3873.42105263158 3935.75 \n\
	3984.88888888889 4043.55 4096.8 4157.9 4210.625 4259.35 4311.9 \n\
	4369.8 4424.55555555556 4483.63157894737 4535.27777777778 4586.4 \n\
	4643.63157894737 4696.35 4754.27777777778 4807.63157894737 \n\
	4859.44444444444 4921.25 4988.94736842105 5043.78947368421 \n\
	5101.76470588235 5156.42105263158 5216.65 5282.2 5346.23529411765 \n\
	5405.76470588235 5468.84210526316 5524.875 5590.05263157895 5654.4 \n\
	5728.5 5800.47368421053 5879.63157894737 5952.9375 6024 \n\
	6100.63157894737 6181.47368421053 6265.61111111111 6363.84210526316 \n\
	6454.05 6543.9 6649.35 6733.78947368421 6839.55 6932 7060.88235294118 \n\
	7186.29411764706 7301.86666666667 7423.70588235294 7563.1052631579 \n\
	7712.42857142857 7863.38888888889 8034.8 8214.9 8433.16666666667 \n\
	8729.94117647059 9061.44444444444 9381.625 9780 10360.2857142857 \n\
	11127.5555555556 12726.7894736842))\n\
\n\
;; binary search\n\
(define (ordered-list-search l score)\n\
  (define (_ start end)\n\
    (cond\n\
     ;; no children\n\
     ((null? l) start)\n\
     (else\n\
      (let ((mid (floor (+ start (/ (- end start) 2)))))\n\
	(cond\n\
	 ;; not found\n\
	 ((< (- end start) 2) start)\n\
	 ;; found\n\
	 ((eq? score (list-ref l mid)) mid)\n\
	 ;; search down\n\
	 ((> (list-ref l mid) score)\n\
	  (_ start mid))\n\
	 ;; search up\n\
	 (else\n\
	  (_ mid end)))))))\n\
  (_ 0 (length l)))\n\
\n\
(define (build-examples n)\n\
  (cond\n\
   ((zero? n) ())\n\
   (else\n\
    (let ((pos (list-ref positions (modulo n (length positions)))))\n\
      (cons\n\
       (nightjar-example\n\
        (list-ref photos n)\n\
        (list (list-ref pos 0) (list-ref pos 1))\n\
        (list-ref pos 2)\n\
        (list-ref pos 3))\n\
       (build-examples (- n 1)))))))\n\
\n\
(define nightjar-examples (build-examples (- (length photos) 1)))\n\
\n\
(define safe-x 0.3)\n\
(define safe-y 0.4)\n\
\n\
(define (generate-image-pos)\n\
  (list (- (* screen-width (+ safe-x (* (rndf) (- 1 (* safe-x 2))))) image-centre-x)\n\
        (- (* screen-height (+ safe-y (* (rndf) (- 1 (* safe-y 2))))) image-centre-y)))\n\
\n\
(define (empty-nightjar-data)\n\
  (list 0 0 0 "monkey" #f 0 () () 0 (sprite 0 0 "wrong.png" 0) 0 0))\n\
\n\
(define (nightjar-start-time g) (list-ref g 0))\n\
(define (nightjar-modify-start-time v g) (list-replace g 0 v))\n\
(define (nightjar-photo-time g) (list-ref g 1))\n\
(define (nightjar-modify-photo-time v g) (list-replace g 1 v))\n\
(define (nightjar-player-id g) (list-ref g 2))\n\
(define (nightjar-modify-player-id v g) (list-replace g 2 v))\n\
(define (nightjar-player-type g) (list-ref g 3))\n\
(define (nightjar-modify-player-type v g) (list-replace g 3 v))\n\
(define (nightjar-played-before g) (list-ref g 4))\n\
(define (nightjar-modify-played-before v g) (list-replace g 4 v))\n\
(define (nightjar-player-age g) (list-ref g 5))\n\
(define (nightjar-modify-player-age v g) (list-replace g 5 v))\n\
(define (nightjar-images g) (list-ref g 6))\n\
(define (nightjar-modify-images v g) (list-replace g 6 v))\n\
(define (nightjar-image-pos g) (list-ref g 7))\n\
(define (nightjar-modify-image-pos v g) (list-replace g 7 v))\n\
(define (nightjar-score g) (list-ref g 8))\n\
(define (nightjar-modify-score v g) (list-replace g 8 v))\n\
(define (nightjar-sprite g) (list-ref g 9))\n\
(define (nightjar-modify-sprite v g) (list-replace g 9 v))\n\
(define (nightjar-found g) (list-ref g 10))\n\
(define (nightjar-modify-found v g) (list-replace g 10 v))\n\
(define (nightjar-total-score g) (list-ref g 11))\n\
(define (nightjar-modify-total-score v g) (list-replace g 11 v))\n\
\n\
(define (nightjar-heading ctx txt)\n\
  (set! ctx.fillStyle highlight-col)\n\
  (set! ctx.font "bold 80pt effra heavy")\n\
  (wrap-text ctx txt 100 200 1500 100))\n\
\n\
(define (nightjar-top-text ctx txt)\n\
  (set! ctx.fillStyle "#fff")\n\
  (set! ctx.font "bold 50pt effra")\n\
  (wrap-text ctx txt 100 200 1300 80))\n\
\n\
(define (nightjar-text ctx txt)\n\
  (set! ctx.fillStyle "#fff")\n\
  (set! ctx.font "bold 50pt effra")\n\
  (wrap-text ctx txt 100 400 1300 80))\n\
\n\
(define (nightjar-small-top-text ctx txt)\n\
  (set! ctx.fillStyle highlight-col)\n\
  (set! ctx.font "bold 40pt effra")\n\
  (wrap-text ctx txt 100 200 1400 60))\n\
\n\
(define (nightjar-small-text ctx txt)\n\
  (set! ctx.fillStyle highlight-col)\n\
  (set! ctx.font "bold 40pt effra")\n\
  (wrap-text ctx txt 100 400 1400 60))\n\
\n\
(define (nightjar-all-text ctx txt)\n\
  (set! ctx.fillStyle "#fff")\n\
  (set! ctx.font "bold 50pt effra")\n\
  (wrap-text ctx txt 100 200 1400 75))\n\
\n\
(define (nightjar-all-text-shadow ctx txt)\n\
  (set! ctx.fillStyle "#fff")\n\
  (set! ctx.font "bold 50pt effra")\n\
  (wrap-text ctx txt 100 200 1400 75))\n\
\n\
(define (time-left c)\n\
  (* (- (game-time c)\n\
        (nightjar-start-time (game-data c)))\n\
     0.001))\n\
\n\
(define (stroke-clock ctx c x y)\n\
  (ctx.beginPath)\n\
  (ctx.moveTo x y)\n\
  (ctx.arc\n\
   x y 100 (* Math.PI -0.5)\n\
   (+ (* Math.PI -0.5)\n\
      (/ (* (time-left c) Math.PI 2) game-time-allowed))\n\
   #t)\n\
  (ctx.fill))\n\
\n\
(define introbg-canvas   \n\
  (let ((tcanvas (document.createElement "canvas")))\n\
    (set! tcanvas.width screen-width)\n\
    (set! tcanvas.height screen-height)\n\
    tcanvas))\n\
\n\
(define introbg-ctx (introbg-canvas.getContext "2d")) \n\
\n\
(define (draw-random-feather)\n\
  (introbg-ctx.drawImage \n\
   (find-image (+ "col-feather-" (+ (random 10) 1) ".png") image-lib)\n\
   (- (random (+ screen-width 100)) 50)\n\
   (- (random screen-height) 200)))\n\
\n\
(define (splat-feathers c)\n\
  (when (not (zero? c))\n\
	(draw-random-feather)\n\
	(splat-feathers (- c 1))))\n\
 \n\
(define (darken-feathers)\n\
  (set! introbg-ctx.globalAlpha 0.4)\n\
  (set! introbg-ctx.fillStyle "#000")\n\
  (introbg-ctx.fillRect 0 0 screen-width screen-height)\n\
  (set! introbg-ctx.globalAlpha 1))\n\
\n\
(define (draw-feather-array ctx x y a)\n\
  (when (not (null? a))\n\
	(let ((img (find-image (+ "col-feather-" (car a) ".png") image-lib))) \n\
	  (ctx.drawImage \n\
	   img\n\
	   x (- y img.height))\n\
	  (draw-feather-array ctx (+ x 80) y (cdr a)))))\n\
\n\
(define (nightjar-draw-clock ctx c)\n\
  (set! ctx.fillStyle bg-col)\n\
  (ctx.beginPath)\n\
  (ctx.moveTo 200 150)\n\
  (ctx.arc 200 150 100 0 (* Math.PI 2) #t)\n\
  (ctx.fill)\n\
  (set! ctx.fillStyle highlight-col)\n\
  (stroke-clock ctx c 200 150)\n\
  (ctx.fill))\n\
\n\
(define (nightjar-new-game c)\n\
  (nightjar-game\n\
   (game-modify-data\n\
    (lambda (d)\n\
      (nightjar-modify-start-time\n\
       (game-time c) d))\n\
    (game-modify-data\n\
     (lambda (d)\n\
       (nightjar-modify-image-pos\n\
        (generate-image-pos)\n\
        (nightjar-modify-sprite\n\
         (sprite -999 -999 "right.png" 0)\n\
         d)))\n\
     c))))\n\
\n\
(define (nightjar-new-game-reset-timer n c)\n\
  (load-image-mutate\n\
   (lambda (c)\n\
     (nightjar-new-game\n\
      (game-modify-data\n\
       (lambda (d)\n\
         (nightjar-modify-images\n\
          (cdr (nightjar-images d))\n\
          (nightjar-modify-photo-time\n\
           (game-time c) d)))\n\
       c)))\n\
   (nightjar-example-file (list-ref (nightjar-images (game-data c)) n)))\n\
  (game-modify-buttons () c))\n\
\n\
(define (nightjar-new-game-images c)\n\
  (define start 0)\n\
  (play-sound "sound/button.wav")  \n\
  (let ((images (crop (shuffle (slice nightjar-examples start 39)) 5)))\n\
    (load-image-mutate\n\
     (lambda (c)\n\
       (nightjar-new-game\n\
        (game-modify-data\n\
         (lambda (d)\n\
           (nightjar-modify-photo-time\n\
            (game-time c)\n\
            (nightjar-modify-images \n\
	     images \n\
	     (nightjar-modify-found 0 d))))\n\
	 c)))     \n\
     (nightjar-example-file (list-ref images 0)))\n\
    (game-modify-buttons () c)))\n\
\n\
(define screensave-offset (- (* (rndf) 150) 40))\n\
\n\
(define (nightjar-intro c)\n\
  (let ((icon-x 150))\n\
    (game-modify-update\n\
     (lambda (t c) c)\n\
     (game-modify-data\n\
      (lambda (d)\n\
	(empty-nightjar-data))\n\
      (game-modify-render\n\
       (lambda (ctx)\n\
	 (set! ctx.fillStyle highlight-col)\n\
	 (set! ctx.font "bold 80pt effra heavy")\n\
	 (wrap-text ctx "WHERE IS THAT NIGHTJAR?" 100 (+ 200 screensave-offset) 1500 100)\n\
	 (set! ctx.fillStyle "#fff")\n\
	 (set! ctx.font "bold 50pt effra")\n\
	 (wrap-multitext-slow ctx (list "Nightjars are nocturnal birds that use camouflage to say hidden during the day. See how fast you are at spotting them...") 100 (+ 400 screensave-offset) 1300 80)\n\
	 )\n\
\n\
       (game-modify-buttons\n\
	(list\n\
	 (image-button\n\
	  "Play"\n\
	  (- default-button-x 300)\n\
	  (+ default-button-y screensave-offset)\n\
	  #f\n\
	  "feather-white-4.png"\n\
	  (lambda (c)\n\
	    (play-sound "sound/button.wav")\n\
	    (nightjar-explain-screen c)))\n\
\n\
	 (image-button\n\
	  "Project nightjar"\n\
	  (+ default-button-x 300)\n\
	  (+ default-button-y screensave-offset)\n\
	  #f\n\
	  "feather-white-3.png"\n\
	  (lambda (c)\n\
	    (play-sound "sound/button.wav")\n\
	    (nightjar-about c)))\n\
	 \n\
	 \n\
	 )\n\
	c))))))\n\
\n\
\n\
(define (nightjar-about c)\n\
  (let ((icon-x 150))\n\
  (game-modify-data\n\
   (lambda (d)\n\
     (empty-nightjar-data))\n\
   (game-modify-render\n\
    (lambda (ctx)\n\
      (ctx.drawImage (find-image "foam-logo.png" image-lib) 670 560)\n\
      (ctx.drawImage (find-image "exeter.png" image-lib) 890 600)\n\
;;      (ctx.drawImage (find-image "feather-divider.png" image-lib) 400 200)\n\
\n\
      (set! ctx.fillStyle highlight-col)\n\
      (set! ctx.font "bold 40pt effra")\n\
      (wrap-multitext \n\
       ctx \n\
       (list "This game was originally made to gather research data on how fast participants spotted nightjars."\n\
	     ""\n\
	     "The research showed that predators which see in three colours (like humans and some primates) are better at spotting nightjars than predators that see in two colours (like mongooses). Prey camouflage and predator vision are in an evolutionary battle.")\n\
       50 100 1400 60))\n\
    \n\
    (game-modify-buttons\n\
     (list\n\
      (image-button\n\
       "Home"\n\
       (+ default-button-x 300)\n\
       (+ default-button-y 60)\n\
       #f\n\
       "feather-white-1.png"\n\
       (lambda (c)\n\
         (play-sound "sound/button.wav")\n\
         (nightjar-intro c)))\n\
\n\
      (image-button\n\
       "Play"\n\
       (- default-button-x 300)\n\
       (+ default-button-y 60)\n\
       #f\n\
       "feather-white-5.png"\n\
       (lambda (c)\n\
         (play-sound "sound/button.wav")\n\
         (nightjar-explain-screen c)))\n\
\n\
      \n\
      \n\
      )\n\
     c)))))\n\
\n\
\n\
(define (get-n-items lst num)\n\
  (cond\n\
   ((null? lst) ())\n\
   ((zero? num) ())\n\
   (else (cons (car lst) (get-n-items (cdr lst) (- num 1))))))\n\
\n\
(define (slice lst start count)\n\
  (if (> start 1)\n\
      (slice (cdr lst) (- start 1) count)\n\
      (get-n-items lst count)))\n\
\n\
(define (nightjar-explain-screen c)\n\
  (game-modify-render\n\
   (lambda (ctx)\n\
     (set! ctx.fillStyle "#fff")\n\
     (set! ctx.font "bold 50pt effra heavy")\n\
;;     (ctx.drawImage (find-image "leftcluster.png" image-lib) 10 100)\n\
;;     (ctx.drawImage (find-image "rightcluster.png" image-lib) 1300 100)\n\
     (wrap-text ctx "There is one nightjar hidden in every photo. Touch it as soon as you see it!" 100 100 1300 70)\n\
     ;;(ctx.drawImage (find-image "nightjar.jpg" image-lib) 470 200)\n\
     )\n\
\n\
   (game-modify-buttons\n\
    (list\n\
\n\
     (image-button\n\
      ""\n\
      (- default-button-x 160)\n\
      200\n\
      #f\n\
      "nightjar.jpg"\n\
      (lambda (c)\n\
        (nightjar-new-game-images c)))\n\
     \n\
    \n\
     (image-button\n\
      "Start"\n\
      default-button-x\n\
      (+ default-button-y 100)\n\
      #f\n\
      "feather-white-3-s.png"\n\
      (lambda (c)\n\
        (nightjar-new-game-images c))))\n\
    c)))\n\
\n\
(define (nightjar-game c)\n\
  ;; todo: choose and delete\n\
  (define example (car (nightjar-images (game-data c))))\n\
\n\
  (game-modify-render\n\
   (lambda (ctx)\n\
     (ctx.drawImage\n\
      (find-image (nightjar-example-file example) image-lib)\n\
      (car (nightjar-image-pos (game-data c)))\n\
      (cadr (nightjar-image-pos (game-data c))))\n\
     (sprite-render\n\
      ctx\n\
      (game-time c)\n\
      (nightjar-sprite (game-data c)))\n\
\n\
     (nightjar-draw-clock ctx c)\n\
\n\
     )\n\
\n\
   (game-modify-update\n\
    (lambda (t c)\n\
      (if (> (- (game-time c)\n\
                (nightjar-start-time (game-data c)))\n\
             (* game-time-allowed 1000))\n\
          (nightjar-fail "You\'ll go hungry tonight!" c)\n\
          c))\n\
\n\
    (game-modify-buttons\n\
     (list\n\
\n\
;      (image-button\n\
;       "I give up"\n\
;       (- screen-width 150)\n\
;       (- screen-height 150)\n\
;       #f\n\
;       "quit.png"\n\
;       (lambda (c)\n\
;         (nightjar-fail "You\'ll go hungry tonight!" c)))\n\
\n\
      ;; button over nightjar\n\
      (rect-button\n\
       ""\n\
       (+ (car (nightjar-example-pos example))\n\
          (car (nightjar-image-pos (game-data c))))\n\
\n\
       (+ (cadr (nightjar-example-pos example))\n\
          (cadr (nightjar-image-pos (game-data c))))\n\
\n\
       (nightjar-example-width example)\n\
       (nightjar-example-height example)\n\
       #f\n\
       (lambda (c)\n\
         (play-sound "sound/found.wav")\n\
         (nightjar-win\n\
          (game-modify-data\n\
           (lambda (d)\n\
	     (let ((score (- (game-time c) (nightjar-start-time d))))\n\
             (nightjar-modify-sprite\n\
              (sprite (- (game-mx c) 126)\n\
                      (- (game-my c) 105)\n\
                      "right.png" (+ (game-time c) 2000))\n\
	      (nightjar-modify-total-score\n\
	       (+ (nightjar-total-score d) score)	       \n\
	       (nightjar-modify-found\n\
		(+ (nightjar-found d) 1)	       \n\
		(nightjar-modify-score score d))))))\n\
           c))))\n\
\n\
      (image-button\n\
       "Home"\n\
       default-button-x\n\
       (+ default-button-y 100)\n\
       #f\n\
       "feather-white-4-s.png"\n\
       (lambda (c)\n\
         (play-sound "sound/button.wav")\n\
         (nightjar-intro c)))\n\
\n\
      ;; big lose button over whole screen\n\
      (rect-button\n\
       ""\n\
       0 0 screen-width screen-height #f\n\
       (lambda (c)\n\
         (play-sound "sound/notfound.wav")\n\
         (game-modify-data\n\
          (lambda (d)\n\
            (nightjar-modify-sprite\n\
             (sprite (- (game-mx c) 126)\n\
                     (- (game-my c) 105)\n\
                     "wrong.png" (+ (game-time c) 2000)) \n\
	     d))\n\
	  c)))\n\
\n\
\n\
      \n\
      ) c))))\n\
\n\
(define (nightjar-fail reason c)\n\
  (game-modify-render\n\
   (lambda (ctx)\n\
     (define example (car (nightjar-images (game-data c))))\n\
     (ctx.drawImage\n\
      (find-image (nightjar-example-file example) image-lib)\n\
      (car (nightjar-image-pos (game-data c)))\n\
      (cadr (nightjar-image-pos (game-data c))))\n\
\n\
     ;; highlight the nightjar\n\
     \n\
     (let ((x (+ (car (nightjar-example-pos example))\n\
		 (car (nightjar-image-pos (game-data c)))))\n\
	   (y (+ (cadr (nightjar-example-pos example))\n\
		 (cadr (nightjar-image-pos (game-data c))))))\n\
       (ctx.beginPath)\n\
       (set! ctx.strokeStyle bg-col)\n\
       (set! ctx.lineWidth 32)\n\
       (ctx.arc (+ x (/ (nightjar-example-width example) 2)) \n\
		(+ y (/ (nightjar-example-height example) 2)) \n\
		(/ (nightjar-example-width example) 2)\n\
		0 (* Math.PI 2) true)\n\
       (ctx.stroke)\n\
       (ctx.beginPath)\n\
       (set! ctx.lineWidth 16)\n\
       (set! ctx.strokeStyle highlight-col)\n\
       (ctx.arc (+ x (/ (nightjar-example-width example) 2)) \n\
		(+ y (/ (nightjar-example-height example) 2)) \n\
		(/ (nightjar-example-width example) 2)\n\
		0 (* Math.PI 2) true)\n\
       (ctx.stroke))\n\
     (set! ctx.lineWidth 1)\n\
\n\
     (sprite-render\n\
      ctx\n\
      (game-time c)\n\
      (nightjar-sprite (game-data c)))\n\
\n\
     (set! ctx.fillStyle bg-col)\n\
     (ctx.fillRect 0 100 screen-width 150)\n\
     (nightjar-all-text-shadow ctx reason))\n\
\n\
   (game-modify-update\n\
    (lambda (t c) c)\n\
\n\
    (game-modify-buttons\n\
     (list\n\
\n\
      (image-button\n\
       "Next"\n\
       (- default-button-x button-gap)\n\
       (+ default-button-y 50) #f\n\
       "feather-white-4-s.png"\n\
       (lambda (c)\n\
         (play-sound "sound/button.wav")\n\
         ;; check end of game\n\
         (if (eq? (length (nightjar-images (game-data c))) 1)\n\
             (nightjar-get-score c "")\n\
             (nightjar-new-game-reset-timer 1 c))))\n\
\n\
      (image-button\n\
       "Home"\n\
       (+ default-button-x button-gap)\n\
       (+ default-button-y 50) #f\n\
       "feather-white-3-s.png"\n\
       (lambda (c)\n\
         (play-sound "sound/button.wav")\n\
         ;; check end of game\n\
         (nightjar-get-score c "")))\n\
\n\
\n\
      ) c))))\n\
\n\
(define (print-trunc a)\n\
  (/ (Math.floor (* a 100)) 100))\n\
\n\
(define (nightjar-win c)\n\
  (game-modify-render\n\
   (lambda (ctx)\n\
     (define example (car (nightjar-images (game-data c))))\n\
 \n\
     (ctx.drawImage\n\
      (find-image (nightjar-example-file example) image-lib)\n\
      (car (nightjar-image-pos (game-data c)))\n\
      (cadr (nightjar-image-pos (game-data c))))\n\
\n\
     (sprite-render\n\
      ctx\n\
      (game-time c)\n\
      (nightjar-sprite (game-data c)))\n\
\n\
     (set! ctx.fillStyle bg-col)\n\
     (ctx.fillRect 0 100 screen-width 150)\n\
\n\
     (let ((done (+ (- 5 (length (nightjar-images (game-data c)))) 1)))\n\
       (nightjar-all-text-shadow ctx (+ "Nightjar " done "/5 found in "\n\
					(print-trunc (/ (nightjar-score (game-data c)) 1000))\n\
					" seconds"))))\n\
\n\
   (game-modify-update\n\
    (lambda (t c) c)\n\
\n\
    (game-modify-buttons\n\
     (list\n\
      (image-button\n\
       "Next"\n\
       (+ default-button-x button-gap)\n\
       (+ default-button-y 50) #f\n\
       "feather-white-3-s.png"\n\
       (lambda (c)\n\
         (play-sound "sound/button.wav")\n\
         ;; check end of game\n\
         (if (eq? (length (nightjar-images (game-data c))) 1)\n\
             (nightjar-get-score c "Well done!")\n\
             (nightjar-new-game-reset-timer 1 c))))\n\
      \n\
      (image-button\n\
       "Home"\n\
       (- default-button-x button-gap)\n\
       (+ default-button-y 50)\n\
       #f\n\
       "feather-white-4-s.png"\n\
       (lambda (c)\n\
         (play-sound "sound/button.wav")\n\
         (nightjar-intro c)))\n\
\n\
\n\
      ) c))))\n\
\n\
(define (nightjar-get-score c reason)\n\
  (nightjar-finish \n\
   game\n\
   (/ (nightjar-total-score (game-data c))\n\
      (nightjar-found (game-data c)))\n\
   (ordered-list-search scores (nightjar-score (game-data c)))\n\
   (nightjar-found (game-data c))\n\
   reason))\n\
\n\
(define (score-to-text score)\n\
  (cond\n\
   ((< score 5) "Wow - good work!")\n\
   ((< score 25) "Good score!")\n\
   ((< score 50) "Not too bad...")\n\
   (else "You might need more practice")))\n\
\n\
(define (get-score-text score count)\n\
  (if (> count 0)\n\
      (+ "That puts you in the top " (+ score 1) "% of players.")\n\
      "You need to spot some nightjars for a score!"))\n\
\n\
(define (trunc a)\n\
  (/ (Math.floor (* a 100)) 100))\n\
\n\
(define (nightjar-finish c av score count reason)\n\
  (game-modify-render\n\
   (lambda (ctx)     \n\
     (let ((top-text reason))\n\
       (if (zero? count)\n\
	 (set! top-text (+ top-text " You didn\'t find any nightjars..."))\n\
	 (set! top-text (+ top-text " You found " count "/5 nightjars in an average of " (trunc (/ av 1000)) " seconds.")))\n\
       (let ((extra ""))\n\
	 (when (not (zero? count)) (set! extra (score-to-text score)))\n\
	 \n\
	 ;;(set! ctx.fillStyle highlight-col)\n\
	 (set! ctx.font "bold 50pt effra")\n\
	 (wrap-multitext-slow\n\
	  ctx \n\
	  (list top-text "" (get-score-text score count) extra)\n\
	  100 200 1400 80))))\n\
   \n\
   (game-modify-update\n\
    (lambda (t c) c)\n\
    \n\
    (game-modify-buttons\n\
     (list\n\
\n\
      (image-button\n\
       "Play again"\n\
       (- default-button-x 350)\n\
       (- default-button-y 100)\n\
       #f\n\
       "feather-white-5b.png"\n\
       (lambda (c)\n\
         (play-sound "sound/button.wav")\n\
         (nightjar-explain-screen c)))\n\
      \n\
      \n\
      (image-button\n\
       "Home"\n\
       default-button-x\n\
       (+ default-button-y 100)\n\
       #f\n\
       "feather-white-1.png"\n\
       (lambda (c)\n\
         (play-sound "sound/button.wav")\n\
         (nightjar-intro c)))\n\
\n\
      (image-button\n\
       "Project nightjar"\n\
       (+ default-button-x 350)\n\
       (- default-button-y 100)\n\
       #f\n\
       "feather-white-3.png"\n\
       (lambda (c)\n\
         (play-sound "sound/button.wav")\n\
         (nightjar-about c)))\n\
\n\
\n\
      ) c))))\n\
\n\
(set! ctx.font "normal 75pt effra heavy")\n\
(centre-text ctx "Loading..." 240)\n\
\n\
(load-images!\n\
 (append (list "feather1.png"\n\
       "feather2.png"\n\
       "feather3.png"\n\
       "feather4.png"\n\
       "leftcluster.png"\n\
       "rightcluster.png"\n\
       "col-feather-1.png"\n\
       "col-feather-2.png"\n\
       "col-feather-3.png"\n\
       "col-feather-4.png"\n\
       "col-feather-5.png"\n\
       "col-feather-6.png"\n\
       "col-feather-7.png"\n\
       "col-feather-8.png"\n\
       "col-feather-9.png"\n\
       "col-feather-10.png"\n\
       "feather-white-1.png"\n\
       "feather-white-2.png"\n\
       "feather-white-3.png"\n\
       "feather-white-4.png"\n\
       "feather-white-5.png"\n\
       "feather-white-5b.png"\n\
       "feather-white-3-s.png"\n\
       "feather-white-4-s.png"\n\
       "right.png"\n\
       "wrong.png"\n\
       "foam-logo.png"\n\
       "feather-divider.png"\n\
       "exeter.png"\n\
       "nightjar.jpg") photos)\n\
 (lambda ()\n\
   (splat-feathers 1000)\n\
   (darken-feathers)\n\
   (start-game canvas ctx)))\n\
\n\
');

        try {
            eval(js);
        } catch (e) {
            zc.to_page("output", "An error occured while evaluating ");
            zc.to_page("output",e);
            zc.to_page("output",e.stack);
        }
    });
}


/**
 * Provides requestAnimationFrame in a cross browser way.
 */
 var requestAnimFrame = (function() {
    return window.requestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    window.mozRequestAnimationFrame ||
    window.oRequestAnimationFrame ||
    window.msRequestAnimationFrame ||
    function(/* function FrameRequestCallback */ callback, /* DOMElement Element */ element) {
    window.setTimeout(callback, 1000/60);    };
    })();
