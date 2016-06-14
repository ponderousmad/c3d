var C3D = (function () {
    "use strict";
    
    window.onload = function(e) {
        MAIN.runTestSuites();
        var test3D = new MAIN.Test3D();
        test3D.maximize = true;
        MAIN.start(document.getElementById("canvas3D"), test3D);
    };
    
    return {
    };
}());
