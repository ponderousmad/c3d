var IMPROC = (function () {
    "use strict";

    var CHANNELS = 4,
        R = 0, G = 1, B = 2, A = 3,
        BYTE_MAX = 255,
        DEPTH_WIDTH = 640,
        DEPTH_HEIGHT = 480;


    function pixelAt(pixels, index, xStride) {
        var offset = index * xStride * CHANNELS;
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

    function byteToUnitValue(value) {
        return ((2.0 * value) / BYTE_MAX) - 1;
    }

    function decodeDepth(pixels, width, height) {
        var CHANNEL_MAX = 8,
            MAX_RED_VALUE = BYTE_MAX - CHANNEL_MAX,
            CHANNELS_MAX = CHANNEL_MAX * CHANNEL_MAX,
            attitude = {
                quaternion: new R3.Q(),
                euler: new R3.V(),
                matrix: R3.identity(),
                validEuler: false
            },
            depths = [],
            skip = 0,
            mmToMeter = 1.0 / 1000.0,
            xStride = Math.max(1, width / DEPTH_WIDTH),
            yStride = Math.max(1, height / DEPTH_HEIGHT);

        if (pixelsEqual(pixelAt(pixels, 0, xStride), [BYTE_MAX, 0, 0, BYTE_MAX])) {
            var qPixel = pixelAt(pixels, 1, xStride),
                q = [];
            for (var o = 0; o < 4; ++o) {
                q.push(byteToUnitValue(qPixel[o]));
            }
            attitude.quaternion = new R3.Q(q[0], q[1], q[2], q[3]);
            skip += 2;
        }
        if (pixelsEqual(pixelAt(pixels, 2, xStride), [BYTE_MAX, 0, 0, BYTE_MAX])) {
            var ePixel = pixelAt(pixels, 3, xStride);
            for (var e = 0; e < 3; ++e) {
                var angleFraction = byteToUnitValue(ePixel[e]);
                console.log("Euler", e, angleFraction, angleFraction * 180);
                attitude.euler.setAt(e, Math.PI * angleFraction);
            }
            attitude.validEuler = true;

            for (var row = 0; row < 3; ++row) {
                var mPixel = pixelAt(pixels, 4 + row, xStride);
                for (var column = 0; column < 3; ++column) {
                    attitude.matrix.setAt(row, column, byteToUnitValue(mPixel[column]));
                }
            }
            skip += 5;
        } else {
            attitude.matrix = R3.makeRotateQ(attitude.quaternion);
            attitude.euler = attitude.matrix.extractEuler();
        }
        console.log("Attitude:", attitude);
        for (var y = 0; y < height; y += yStride) {
            for (var x = 0; x < width; x += xStride) {
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
                    depths.push((baseDepth + offset) * mmToMeter);
                }
            }
        }
        return { depths: depths, width: Math.min(DEPTH_WIDTH, width), height: Math.min(DEPTH_HEIGHT, width), attitude: attitude };
    }

    function processImage(image) {
        var canvas = document.createElement('canvas'),
            context = canvas.getContext('2d'),
            height = image.height / 2,
            heightOffset = height,
            depthHeight = height,
            depthWidth = image.width;

        if (image.width % DEPTH_WIDTH !== 0) {
            height = Math.ceil(DEPTH_HEIGHT * DEPTH_WIDTH / image.width);
            heightOffset = image.height - height;
            depthHeight = DEPTH_HEIGHT;
            depthWidth = DEPTH_WIDTH;
        }

        canvas.width = image.width;
        canvas.height = height;
        context.clearRect(0, 0, canvas.width, canvas.height);

        context.drawImage(image, 0, heightOffset, image.width, height, 0, 0, image.width, height);

        var buffer = context.getImageData(0, 0, image.width, height),
            result = decodeDepth(buffer.data, depthWidth, depthHeight);
        result.imageWidth = image.width;
        result.imageHeight = heightOffset;

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
