# C3D

Web GL program for visualizing registered depth images from [PairedCapture](https://github.com/ponderousmad/PairedCapture). Note that there is currently an issue using images directly from the device or even exported from Photos. To preseve the encoding you have to export the unmodified original of the image and then use [pngcrush](http://pmt.sourceforge.net/pngcrush/) to clear out the [sRGB/gamma chunks](https://hsivonen.fi/png-gamma/).

[Shows images at random](https://ponderousmad.com/c3d/index.html) from the [Pyndent](https://github.com/ponderousmad/Pyndent) training set.

Use the tap/click and drag to orbit, pinch/mouse wheel to zoom, and menu at right to adjust settings.

Built using [BlitBlort](https://github.com/ponderousmad/blitblort).
