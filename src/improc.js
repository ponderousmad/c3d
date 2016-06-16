var IMPROC = (function () {
    "use strict";
    
    var CHANNELS = 4,
        R = 0, G = 1, B = 2, A = 3;
        
    
    function pixelAt(pixels, offset) {
        return [pixels[offset + R], pixels[offset + G], pixels[offset + B], pixels[offset + A]];
    }
    
    function pixelsEqual(a, b) {
        for (var c = 0; c < CHANNELS; ++c) {
            if (a[c] !== b[c]) {
                return false;
            }
        }
        return true;
    }
    
    function decodeDepth(pixels, width, height, heightOffset) {
        var BYTE_MAX = 255,
            CHANNEL_MAX = 8.0,
            MAX_RED_VALUE = BYTE_MAX - CHANNEL_MAX,
            CHANNELS_MAX = CHANNEL_MAX * CHANNEL_MAX,
            DEPTH_START_INDEX = heightOffset * width * CHANNELS,
            orientation = [1, 0, 0, 0],
            depths = [],
            skip = 0,
            i = DEPTH_START_INDEX;

        if (pixelsEqual(pixelAt(pixels, DEPTH_START_INDEX), [BYTE_MAX, 0, 0, BYTE_MAX])) {
            var pixel = pixelAt(pixels, DEPTH_START_INDEX + CHANNELS);
            for (var o = 0; o < orientation.length; ++o) {
                orientation[o] = ((2.0 * pixel[o]) / BYTE_MAX) - 1;
            }
            console.log("Found attitude:", orientation);
            skip = 2;
        }
        for (var y = 0; y < height; ++y) {
            for (var x = 0; x < width; ++x) {
                var r = pixels[i + R],
                    g = pixels[i + G],
                    b = pixels[i + B];
                if (r === 0 || skip > 0) {
                    depths.push(null);
                    skip -= 1;
                } else {
                    depths.push(((MAX_RED_VALUE - r) * CHANNELS_MAX) + ((g - r) * CHANNEL_MAX) + (b - r));
                }
                i += CHANNELS;
            }
        }
        return { depths: depths, orientation: orientation };
    }
    
    function processImage(image) {
        var canvas = document.createElement('canvas'),
            context = canvas.getContext('2d'),
            height = image.height / 2;

        canvas.width = image.width;
        canvas.height = image.height;
        context.clearRect(0, 0, image.width + 2, image.height + 2);
        context.drawImage(image, 0, 0);
            
        var buffer = context.getImageData(0, 0, image.width, image.height),
            data = buffer.data,
            result = decodeDepth(data, image.width, height, height);
        
        canvas.height = height;
        result.image = canvas;
        
        return result;
    }
    
    return {
        processImage: processImage
    };
}());