

sources = [["{{SYNTAX}}","scm/syntax.jscm"],
           ["{{BASE}}","scm/base.jscm"],
           ["{{LCE}}","scm/lce.jscm"],
           ["{{GAME}}","scm/game.jscm"]
]

pre = "js/pre-static.js"
target = "js/static.js"

def load_from_file(fn):
    with open(fn, 'r') as myfile:
        return myfile.read()

pre_data=load_from_file(pre)
target_data=pre_data

for source in sources:
    scm = load_from_file(source[1])
    scm = scm.replace("\n","\\n\\\n")
    scm = scm.replace("'","\\'")
    target_data = target_data.replace(source[0],("\'"+scm+"\'"))


with open(target, 'w') as myfile:
    myfile.write(target_data)

