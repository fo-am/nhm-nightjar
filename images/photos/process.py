import os

path = "."
dest = ""

i = 0
for (path, dirs, files) in os.walk(path):
    for filename in files:
        name, extension = os.path.splitext(filename)
        if extension == ".jpg":
            #front = path.replace("/","_")
            #front = front.replace(" ","_")
            #front = front.replace(".","")
            outname = "mongoose-"+name+".jpg"
            #ppath = path.replace(" ","\ ")
            print(filename)
            os.system("convert "+path+"/"+filename+" -channel red,green -fx \"(r+g)/2\" "+dest+outname);
