ffmpeg -r 24 -f image2 -i output/out_%%04d.png -s 1920x980 -vcodec libx264 -crf 20  -pix_fmt yuv420p des.mp4
