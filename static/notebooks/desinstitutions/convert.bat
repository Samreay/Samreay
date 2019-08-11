ffmpeg -r 30 -f image2 -i output/out_%%04d.png -s 1920x980 -vcodec libx264 -crf 25  -pix_fmt yuv420p test.mp4
