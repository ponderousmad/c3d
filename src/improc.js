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
    
    function decodeDepth(pixels, width, height) {
        var BYTE_MAX = 255,
            CHANNEL_MAX = 8,
            MAX_RED_VALUE = BYTE_MAX - CHANNEL_MAX,
            CHANNELS_MAX = CHANNEL_MAX * CHANNEL_MAX,
            orientation = [1, 0, 0, 0],
            depths = [],
            skip = 0;

        if (pixelsEqual(pixelAt(pixels, 0), [BYTE_MAX, 0, 0, BYTE_MAX])) {
            var pixel = pixelAt(pixels, CHANNELS);
            for (var o = 0; o < orientation.length; ++o) {
                orientation[o] = ((2.0 * pixel[o]) / BYTE_MAX) - 1;
            }
            console.log("Found attitude:", orientation);
            skip = 2;
        }
        for (var y = 0; y < height; ++y) {
            for (var x = 0; x < width; ++x) {
                var i = (y * width + x) * CHANNELS;
                var r = pixels[i + R],
                    g = pixels[i + G],
                    b = pixels[i + B];
                if (r === 0 || skip > 0) {
                    depths.push(null);
                    skip -= 1;
                } else {
                    var baseDepth = (MAX_RED_VALUE - r) * CHANNELS_MAX,
                        offset = (g - r) * CHANNEL_MAX + (b - r);
                    depths.push(baseDepth + offset);
                }
            }
        }
        return { depths: depths, width: width, height: height, attitude: orientation };
    }
    
    function processImage(image) {
        var canvas = document.createElement('canvas'),
            context = canvas.getContext('2d'),
            height = image.height / 2;

        canvas.width = image.width;
        canvas.height = height;
        context.clearRect(0, 0, canvas.width, canvas.height);
        
        context.drawImage(image, 0, height, image.width, height, 0, 0, image.width, height);
            
        var buffer = context.getImageData(0, 0, image.width, image.height),
            data = buffer.data,
            result = decodeDepth(data, image.width, height, height);
        
        result.width = image.width;
        result.height = height;
        
        return result;
    }
    
    function descendingFactors(number) {
        var factors = [],
            factor = 2;
        while (number > 1) {
            if (number % factor === 0) {
                factors.push(factor);
                number = number / factor;
            } else {
                factor += 1;
            }
        }
        factors.reverse();
        return factors;
    }

    function computeScales(width, height) {
        var widthScales = descendingFactors(width),
            heightScales = descendingFactors(height),
            length = Math.max(widthScales.length, heightScales.length),
            scales = [];
        for (var i = 0; i < length; ++i) {
            var x = i < widthScales.length  ? widthScales[i]  : 1,
                y = i < heightScales.length ? heightScales[i] : 1;
            scales.push([x, y]);
        }
        return scales;
    }
    
    function reduceImage(values, width, height, scale, strategy) {
        var reduced = [],
            totalWidth = width * scale[0];
        for (var y = 0; y < height; ++y) {
            for (var x = 0; x < width; ++x) {
                var value = null,
                    count = 0;
                for (var sy = 0; sy < scale[1]; ++sy) {
                    var offset = ((y * scale[1]) + sy) * totalWidth + (x * scale[0]);
                    for (var sx = 0; sx < scale[0]; ++sx) {
                        var v = values[offset + sx];
                        if (v !== null) {
                            count += 1;
                            if (value === null) {
                                value = v;
                            } else {
                                value = strategy(v, count, value);
                            }
                        }
                    }
                }
                reduced.push(value);
            }
        }
        return reduced;
    }
    
    function maxStrategy(value, count, accumulator) {
        return Math.max(value, accumulator);
    }
    
    function minStrategy(value, count, accumulator) {
        return Math.min(value, accumulator);
    }
    
    function avgStrategy(value, count, accumulator) {
        return (accumulator * (count - 1) + value) / count;
    }
    
    function upfillNulls(target, source, width, height, upscale) {
        var index = 0,
            scaleWidth = width / upscale[0];
        for (var y = 0; y < height; ++y) {
            for (var x = 0; x < width; ++x) {
                if (target[index] === null) {
                    var sx = Math.floor(x / upscale[0]),
                        sy = Math.floor(y / upscale[1]);
                    target[index] = source[sy * scaleWidth + sx];
                }
                ++index;
            }
        }
    }
    
    function mipmapImputer(values, width, height, strategy) {
        if (!strategy) {
            strategy = maxStrategy;
        }
        var scales = computeScales(width, height),
            mipmaps = [values.slice()],
            w = width,
            h = height;
        
        for (var s = 0; s < scales.length; ++s) {
            var scale = scales[s];
            w = w / scale[0];
            h = h / scale[1];

            mipmaps.push(reduceImage(mipmaps[mipmaps.length - 1], w, h, scale, strategy));
        }
        
        for (var m = mipmaps.length - 1; m > 0; --m) {
            var upscale = scales[m-1];
            w = w * upscale[0];
            h = h * upscale[1];
            upfillNulls(mipmaps[m-1], mipmaps[m], w, h, upscale);
        }
        return mipmaps[0];
    }
    
    function nextPowerOfTwo(target) {
        var value = 1;
        while (value < target) {
            value *= 2;
        }
        return value;
    }
    
    return {
        processImage: processImage,
        mipmapImputer: mipmapImputer,
        strategies : { max: maxStrategy, min: minStrategy, avg: avgStrategy },
        nextPowerOfTwo: nextPowerOfTwo
    };
}());
