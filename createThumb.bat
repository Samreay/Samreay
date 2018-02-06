setlocal
echo %1
cd static\img\blog\%1
set img=%2
if not defined img set img="main.jpg"
echo %img%
magick %img% -sampling-factor 4:2:0 -strip -quality 60 -resize 90x90^^ -gravity center -crop 90x90+0+0 +repage thumb.jpg 
magick %img% -sampling-factor 4:2:0 -strip -quality 80 -resize 600x400^^ -gravity center -crop 600x400+0+0 +repage thumbFB.jpg 
