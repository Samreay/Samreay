@echo off
setlocal
echo %1
IF NOT EXIST static\img\%1 EXIT /B
cd static\img\%1
set img=%2
if not defined img set img="main.jpg"
echo %img%
for /R %%U in (*.png) do echo %%U && magick mogrify -resize "1000>" -sampling-factor 4:2:0 -strip -quality 80 -format jpg %%U
magick %img% -sampling-factor 4:2:0 -strip -quality 60 -resize 120x120^^ -gravity center -crop 120x120+0+0 +repage thumb_blog.jpg
magick %img% -sampling-factor 4:2:0 -strip -quality 60 -resize 180x120^^ -gravity center -crop 180x120+0+0 +repage thumb_outreach.jpg
magick %img% -sampling-factor 4:2:0 -strip -quality 70 -resize 350x200^^ -gravity center -crop 350x200+0+0 +repage thumb_project.jpg
magick %img% -sampling-factor 4:2:0 -strip -quality 70 -resize 500x250^^ -gravity center -crop 500x250+0+0 +repage thumb_fb.jpg
