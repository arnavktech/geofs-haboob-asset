// ==UserScript==
// @name         GeoFS Cinematic Sandstorm Disaster System
// @namespace    https://geo-fs.com/
// @version      7.0.0
// @description  Persistent non-decaying Arrakis Dune sandstorm with continuous extreme filter, locked UI violent airframe shaking, sand rain, and 3D GLB horizon engine
// @match        https://www.geo-fs.com/geofs.php*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    var MODEL_CDN_URL = 'https://cdn.jsdelivr.net/gh/arnavktech/geofs-haboob-asset@main/haboob_cinematic.glb';
    var MODEL_RAW_URL = 'https://raw.githubusercontent.com/arnavktech/geofs-haboob-asset/main/haboob_cinematic.glb';
    var MODEL_LOCAL_URL = 'http://127.0.0.1:8000/haboob_cinematic.glb';

    var STORM_TIERS = [
        {
            name: 'Tier I: Outflow Boundary',
            baseWind: 20.0,
            gustWind: 28.0,
            visMeters: 2800.0,
            fogDensity: 0.0015,
            turbulenceLoad: 0.45,
            sandRainDensity: 0.25,
            waterIntensity: 0.15,
            shakeScale: 2.2,
            flashFreq: 0.0
        },
        {
            name: 'Tier II: Desert Squall',
            baseWind: 29.0,
            gustWind: 40.0,
            visMeters: 1400.0,
            fogDensity: 0.0035,
            turbulenceLoad: 0.85,
            sandRainDensity: 0.50,
            waterIntensity: 0.40,
            shakeScale: 4.2,
            flashFreq: 0.03
        },
        {
            name: 'Tier III: Haboob Wall',
            baseWind: 45.0,
            gustWind: 65.0,
            visMeters: 550.0,
            fogDensity: 0.0068,
            turbulenceLoad: 1.25,
            sandRainDensity: 0.75,
            waterIntensity: 0.70,
            shakeScale: 6.5,
            flashFreq: 0.10
        },
        {
            name: 'Tier IV: Apex Sandstorm',
            baseWind: 70.0,
            gustWind: 95.0,
            visMeters: 200.0,
            fogDensity: 0.0105,
            turbulenceLoad: 1.75,
            sandRainDensity: 0.92,
            waterIntensity: 0.90,
            shakeScale: 9.0,
            flashFreq: 0.22
        },
        {
            name: 'Tier V: Coriolis Super-Storm',
            baseWind: 105.0,
            gustWind: 145.0,
            visMeters: 60.0,
            fogDensity: 0.0165,
            turbulenceLoad: 2.45,
            sandRainDensity: 1.0,
            waterIntensity: 1.0,
            shakeScale: 12.5,
            flashFreq: 0.40
        }
    ];

    var stormState = {
        active: false,
        tierIndex: 1,
        stormLat: 0,
        stormLon: 0,
        stormAlt: 0,
        headingRad: 0,
        intensity: 1.0,
        distance: 0,
        startTime: 0,
        lastUpdateTime: 0,
        sandAccumulation: 0,
        flashActive: 0,
        cinematicBars: false,
        hudVisible: true,
        customResource: null,
        originalFog: null,
        originalAtmosphere: null,
        originalLight: null
    };

    var stormModelPrimitive = null;
    var stormEntity = null;
    var postProcessStage = null;
    var overlayCanvas = null;
    var overlayCtx = null;
    var animFrameId = null;

    var letterboxTop = null;
    var letterboxBottom = null;

    var SAND_COUNT = 1600;
    var sandX = new Float32Array(SAND_COUNT);
    var sandY = new Float32Array(SAND_COUNT);
    var sandZ = new Float32Array(SAND_COUNT);
    var sandSize = new Float32Array(SAND_COUNT);
    var sandType = new Uint8Array(SAND_COUNT);
    var sandLife = new Float32Array(SAND_COUNT);
    var sandMaxLife = new Float32Array(SAND_COUNT);

    var SAND_RAIN_COUNT = 550;
    var rainX = new Float32Array(SAND_RAIN_COUNT);
    var rainY = new Float32Array(SAND_RAIN_COUNT);
    var rainLen = new Float32Array(SAND_RAIN_COUNT);
    var rainSpeed = new Float32Array(SAND_RAIN_COUNT);
    var rainAlpha = new Float32Array(SAND_RAIN_COUNT);
    var rainWidth = new Float32Array(SAND_RAIN_COUNT);

    var WATER_COUNT = 260;
    var waterX = new Float32Array(WATER_COUNT);
    var waterY = new Float32Array(WATER_COUNT);
    var waterRadius = new Float32Array(WATER_COUNT);
    var waterActive = new Uint8Array(WATER_COUNT);

    var SPARK_COUNT = 10;
    var sparks = [];

    var hudElements = {
        container: null,
        statusVal: null,
        tierVal: null,
        distanceVal: null,
        visibilityVal: null,
        windVal: null,
        waterVal: null,
        sandRainVal: null,
        gLoadVal: null,
        tierBtns: [],
        startBtn: null,
        stopBtn: null,
        cineBtn: null,
        hideBtn: null,
        fileInput: null,
        importBtn: null
    };

    function awaitEngine() {
        var timer = setInterval(function() {
            if (
                typeof window.geofs === 'object' &&
                window.geofs !== null &&
                geofs.aircraft &&
                geofs.aircraft.instance &&
                geofs.aircraft.instance.llaLocation &&
                geofs.api &&
                geofs.api.viewer &&
                geofs.api.viewer.scene &&
                typeof window.Cesium === 'object' &&
                window.Cesium !== null
            ) {
                clearInterval(timer);
                initSystem();
            }
        }, 150);
    }

    function initSystem() {
        saveSceneBaseline();
        injectStyles();
        createLetterbox();
        buildHUD();
        createOverlayCanvas();
        initParticlePools();
        bindGlobalKeys();
    }

    function saveSceneBaseline() {
        var scene = geofs.api.viewer.scene;
        stormState.originalFog = {
            enabled: scene.fog.enabled,
            density: scene.fog.density,
            screenSpaceErrorFactor: scene.fog.screenSpaceErrorFactor,
            minimumBrightness: scene.fog.minimumBrightness
        };
        stormState.originalAtmosphere = {
            baseColor: scene.globe.baseColor ? Cesium.Color.clone(scene.globe.baseColor) : null,
            hue: scene.globe.atmosphereHueShift,
            sat: scene.globe.atmosphereSaturationShift,
            bri: scene.globe.atmosphereBrightnessShift,
            skyHue: scene.skyAtmosphere ? scene.skyAtmosphere.hueShift : 0,
            skySat: scene.skyAtmosphere ? scene.skyAtmosphere.saturationShift : 0,
            skyBri: scene.skyAtmosphere ? scene.skyAtmosphere.brightnessShift : 0
        };
        if (scene.light) {
            stormState.originalLight = Cesium.Color.clone(scene.light.color);
        }
    }

    function injectStyles() {
        var style = document.createElement('style');
        style.id = 'geofs-haboob-dune-styles';
        style.textContent =
            '#geofs-storm-hud {' +
            '    position: fixed;' +
            '    top: 24px;' +
            '    right: 24px;' +
            '    width: 340px;' +
            '    background: #0a0807;' +
            '    border: 1px solid #2d2016;' +
            '    box-shadow: 0 20px 60px rgba(0,0,0,0.96);' +
            '    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;' +
            '    color: #c8b9a6;' +
            '    font-size: 11px;' +
            '    letter-spacing: 0.05em;' +
            '    z-index: 100000;' +
            '    user-select: none;' +
            '    border-radius: 4px;' +
            '    will-change: transform, box-shadow, border-color;' +
            '    transition: opacity 0.25s ease;' +
            '    overflow: hidden;' +
            '}' +
            '#geofs-storm-hud::after {' +
            '    content: "";' +
            '    position: absolute;' +
            '    top: 0; left: 0; right: 0; bottom: 0;' +
            '    pointer-events: none;' +
            '    background: radial-gradient(circle at 80% 20%, rgba(225, 145, 55, 0.16), transparent 70%);' +
            '    opacity: 0;' +
            '    transition: opacity 0.4s ease;' +
            '}' +
            '#geofs-storm-hud.sand-coated::after {' +
            '    opacity: 1;' +
            '}' +
            '#geofs-storm-bar {' +
            '    background: #140f0c;' +
            '    padding: 12px 16px;' +
            '    border-bottom: 1px solid #261910;' +
            '    cursor: move;' +
            '    display: flex;' +
            '    justify-content: space-between;' +
            '    align-items: center;' +
            '    font-weight: 700;' +
            '    text-transform: uppercase;' +
            '    color: #f3dfca;' +
            '    font-size: 10px;' +
            '    letter-spacing: 0.1em;' +
            '}' +
            '#geofs-storm-core {' +
            '    padding: 14px 16px;' +
            '}' +
            '#storm-tier-selector {' +
            '    display: grid;' +
            '    grid-template-columns: repeat(5, 1fr);' +
            '    gap: 4px;' +
            '    margin-bottom: 12px;' +
            '}' +
            '.storm-tier-btn {' +
            '    background: #15110d;' +
            '    border: 1px solid #281d14;' +
            '    color: #7d6b5c;' +
            '    padding: 6px 0;' +
            '    font-size: 9px;' +
            '    font-weight: 700;' +
            '    text-transform: uppercase;' +
            '    cursor: pointer;' +
            '    transition: all 0.15s ease;' +
            '}' +
            '.storm-tier-btn:hover {' +
            '    background: #231b14;' +
            '    border-color: #553c29;' +
            '    color: #e5c3a3;' +
            '}' +
            '.storm-tier-btn.active {' +
            '    background: #3c2411;' +
            '    border-color: #bc7228;' +
            '    color: #ffb762;' +
            '    box-shadow: 0 0 10px rgba(188, 114, 40, 0.4);' +
            '}' +
            '.storm-row {' +
            '    display: flex;' +
            '    justify-content: space-between;' +
            '    margin-bottom: 7px;' +
            '    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;' +
            '}' +
            '.storm-tag {' +
            '    color: #725e4c;' +
            '    font-size: 10px;' +
            '    text-transform: uppercase;' +
            '}' +
            '.storm-data {' +
            '    color: #edd5bd;' +
            '    font-weight: 600;' +
            '}' +
            '#geofs-storm-btns {' +
            '    display: grid;' +
            '    grid-template-columns: 1fr 1fr;' +
            '    gap: 6px;' +
            '    margin-top: 14px;' +
            '}' +
            '.storm-action {' +
            '    background: #17110d;' +
            '    border: 1px solid #302115;' +
            '    color: #937f6d;' +
            '    padding: 9px 0;' +
            '    font-size: 10px;' +
            '    font-weight: 700;' +
            '    text-transform: uppercase;' +
            '    letter-spacing: 0.08em;' +
            '    cursor: pointer;' +
            '    transition: all 0.15s ease;' +
            '}' +
            '.storm-action:hover {' +
            '    background: #241a12;' +
            '    border-color: #4f3622;' +
            '    color: #ffffff;' +
            '}' +
            '#storm-btn-run.active {' +
            '    background: #351c09;' +
            '    border-color: #b5631b;' +
            '    color: #ffa442;' +
            '    box-shadow: 0 0 14px rgba(181, 99, 27, 0.35);' +
            '}' +
            '#storm-btn-cine.active {' +
            '    background: #1a1728;' +
            '    border-color: #423b7b;' +
            '    color: #9d96ff;' +
            '}' +
            '#storm-btn-import {' +
            '    grid-column: span 2;' +
            '    background: #120e0b;' +
            '    border: 1px dashed #352518;' +
            '    color: #7d6b5b;' +
            '    padding: 7px 0;' +
            '    font-size: 9px;' +
            '    font-weight: 600;' +
            '    text-transform: uppercase;' +
            '    cursor: pointer;' +
            '    margin-top: 4px;' +
            '}' +
            '#storm-btn-import:hover {' +
            '    background: #1d1510;' +
            '    border-color: #634329;' +
            '    color: #c9b19b;' +
            '}' +
            '#geofs-storm-viewport {' +
            '    position: fixed;' +
            '    top: 0;' +
            '    left: 0;' +
            '    width: 100vw;' +
            '    height: 100vh;' +
            '    pointer-events: none;' +
            '    z-index: 9999;' +
            '}' +
            '.geofs-cine-bar {' +
            '    position: fixed;' +
            '    left: 0;' +
            '    width: 100vw;' +
            '    height: 0vh;' +
            '    background: #000000;' +
            '    z-index: 99999;' +
            '    pointer-events: none;' +
            '    transition: height 0.4s cubic-bezier(0.16, 1, 0.3, 1);' +
            '}' +
            '#geofs-cine-top {' +
            '    top: 0;' +
            '}' +
            '#geofs-cine-bottom {' +
            '    bottom: 0;' +
            '}' +
            '.geofs-cine-bar.active {' +
            '    height: 12vh;' +
            '}';
        document.head.appendChild(style);
    }

    function createLetterbox() {
        letterboxTop = document.createElement('div');
        letterboxTop.id = 'geofs-cine-top';
        letterboxTop.className = 'geofs-cine-bar';

        letterboxBottom = document.createElement('div');
        letterboxBottom.id = 'geofs-cine-bottom';
        letterboxBottom.className = 'geofs-cine-bar';

        document.body.appendChild(letterboxTop);
        document.body.appendChild(letterboxBottom);
    }

    function buildHUD() {
        var hud = document.createElement('div');
        hud.id = 'geofs-storm-hud';
        hud.innerHTML =
            '<div id="geofs-storm-bar">' +
            '    <span>Arrakis Coriolis Engine</span>' +
            '    <span id="storm-hud-mode" style="color:#634b39;">OFFLINE</span>' +
            '</div>' +
            '<div id="geofs-storm-core">' +
            '    <div id="storm-tier-selector">' +
            '        <button class="storm-tier-btn" data-tier="0">I</button>' +
            '        <button class="storm-tier-btn active" data-tier="1">II</button>' +
            '        <button class="storm-tier-btn" data-tier="2">III</button>' +
            '        <button class="storm-tier-btn" data-tier="3">IV</button>' +
            '        <button class="storm-tier-btn" data-tier="4">V</button>' +
            '    </div>' +
            '    <div class="storm-row">' +
            '        <span class="storm-tag">Severity Profile</span>' +
            '        <span class="storm-data" id="storm-out-tier" style="color:#f29d38;">Tier II: Desert Squall</span>' +
            '    </div>' +
            '    <div class="storm-row">' +
            '        <span class="storm-tag">Disaster Status</span>' +
            '        <span class="storm-data" id="storm-out-dist">STANDBY</span>' +
            '    </div>' +
            '    <div class="storm-row">' +
            '        <span class="storm-tag">Optical Clarity</span>' +
            '        <span class="storm-data" id="storm-out-vis">100% (---)</span>' +
            '    </div>' +
            '    <div class="storm-row">' +
            '        <span class="storm-tag">Turbulent Gusts</span>' +
            '        <span class="storm-data" id="storm-out-wind">---</span>' +
            '    </div>' +
            '    <div class="storm-row">' +
            '        <span class="storm-tag">Sand Rain Cascade</span>' +
            '        <span class="storm-data" id="storm-out-sandrain">0%</span>' +
            '    </div>' +
            '    <div class="storm-row">' +
            '        <span class="storm-tag">Airframe G-Load</span>' +
            '        <span class="storm-data" id="storm-out-gload">+1.00 G</span>' +
            '    </div>' +
            '    <div class="storm-row">' +
            '        <span class="storm-tag">Windshield Water</span>' +
            '        <span class="storm-data" id="storm-out-water">0%</span>' +
            '    </div>' +
            '    <div id="geofs-storm-btns">' +
            '        <button id="storm-btn-run" class="storm-action">Start Disaster</button>' +
            '        <button id="storm-btn-halt" class="storm-action">Stop Disaster</button>' +
            '        <button id="storm-btn-cine" class="storm-action">2.39:1 Scope (C)</button>' +
            '        <button id="storm-btn-hide" class="storm-action">Hide HUD (H)</button>' +
            '        <button id="storm-btn-import">Asset: Live Cloud Synced</button>' +
            '        <input type="file" id="storm-file-loader" accept=".glb,.gltf" style="display:none;" />' +
            '    </div>' +
            '</div>';
        document.body.appendChild(hud);

        hudElements.container = hud;
        hudElements.statusVal = document.getElementById('storm-hud-mode');
        hudElements.tierVal = document.getElementById('storm-out-tier');
        hudElements.distanceVal = document.getElementById('storm-out-dist');
        hudElements.visibilityVal = document.getElementById('storm-out-vis');
        hudElements.windVal = document.getElementById('storm-out-wind');
        hudElements.sandRainVal = document.getElementById('storm-out-sandrain');
        hudElements.gLoadVal = document.getElementById('storm-out-gload');
        hudElements.waterVal = document.getElementById('storm-out-water');
        hudElements.startBtn = document.getElementById('storm-btn-run');
        hudElements.stopBtn = document.getElementById('storm-btn-halt');
        hudElements.cineBtn = document.getElementById('storm-btn-cine');
        hudElements.hideBtn = document.getElementById('storm-btn-hide');
        hudElements.fileInput = document.getElementById('storm-file-loader');
        hudElements.importBtn = document.getElementById('storm-btn-import');

        var tierButtons = hud.querySelectorAll('.storm-tier-btn');
        tierButtons.forEach(function(btn) {
            hudElements.tierBtns.push(btn);
            btn.addEventListener('click', function() {
                var index = parseInt(btn.getAttribute('data-tier'), 10);
                setStormTier(index);
            });
        });

        applyDraggable(hud, document.getElementById('geofs-storm-bar'));

        hudElements.startBtn.addEventListener('click', function() {
            if (!stormState.active) {
                startDisaster();
            }
        });

        hudElements.stopBtn.addEventListener('click', function() {
            if (stormState.active) {
                stopDisaster();
            }
        });

        hudElements.cineBtn.addEventListener('click', toggleCinematicBars);
        hudElements.hideBtn.addEventListener('click', toggleHUDVisibility);

        hudElements.importBtn.addEventListener('click', function() {
            hudElements.fileInput.click();
        });

        hudElements.fileInput.addEventListener('change', function(evt) {
            if (evt.target.files && evt.target.files[0]) {
                var file = evt.target.files[0];
                var blobUrl = URL.createObjectURL(file);
                stormState.customResource = new Cesium.Resource({
                    url: blobUrl,
                    extension: 'glb'
                });
                hudElements.importBtn.textContent = 'Custom: ' + file.name.substring(0, 15);
                if (stormState.active) {
                    respawnModel();
                }
            }
        });
    }

    function setStormTier(index) {
        stormState.tierIndex = index;
        hudElements.tierBtns.forEach(function(btn, idx) {
            if (idx === index) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        var tier = STORM_TIERS[index];
        hudElements.tierVal.textContent = tier.name;
        if (stormState.active) {
            var scene = geofs.api.viewer.scene;
            scene.fog.density = tier.fogDensity;
        }
    }

    function toggleCinematicBars() {
        stormState.cinematicBars = !stormState.cinematicBars;
        if (stormState.cinematicBars) {
            letterboxTop.classList.add('active');
            letterboxBottom.classList.add('active');
            hudElements.cineBtn.classList.add('active');
        } else {
            letterboxTop.classList.remove('active');
            letterboxBottom.classList.remove('active');
            hudElements.cineBtn.classList.remove('active');
        }
    }

    function toggleHUDVisibility() {
        stormState.hudVisible = !stormState.hudVisible;
        hudElements.container.style.opacity = stormState.hudVisible ? '1' : '0';
        hudElements.container.style.pointerEvents = stormState.hudVisible ? 'auto' : 'none';
    }

    function bindGlobalKeys() {
        window.addEventListener('keydown', function(e) {
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
                return;
            }
            if (e.key === 'c' || e.key === 'C') {
                toggleCinematicBars();
            } else if (e.key === 'h' || e.key === 'H') {
                toggleHUDVisibility();
            } else if (e.key === '1') {
                setStormTier(0);
            } else if (e.key === '2') {
                setStormTier(1);
            } else if (e.key === '3') {
                setStormTier(2);
            } else if (e.key === '4') {
                setStormTier(3);
            } else if (e.key === '5') {
                setStormTier(4);
            }
        });
    }

    function applyDraggable(panel, handle) {
        var offX = 0, offY = 0, startX = 0, startY = 0;
        handle.onmousedown = function(e) {
            e.preventDefault();
            startX = e.clientX;
            startY = e.clientY;
            document.onmouseup = function() {
                document.onmouseup = null;
                document.onmousemove = null;
            };
            document.onmousemove = function(e) {
                e.preventDefault();
                offX = startX - e.clientX;
                offY = startY - e.clientY;
                startX = e.clientX;
                startY = e.clientY;
                panel.style.top = (panel.offsetTop - offY) + 'px';
                panel.style.left = (panel.offsetLeft - offX) + 'px';
                panel.style.right = 'auto';
            };
        };
    }

    function createOverlayCanvas() {
        overlayCanvas = document.createElement('canvas');
        overlayCanvas.id = 'geofs-storm-viewport';
        overlayCanvas.width = window.innerWidth;
        overlayCanvas.height = window.innerHeight;
        document.body.appendChild(overlayCanvas);
        overlayCtx = overlayCanvas.getContext('2d', { alpha: true });

        window.addEventListener('resize', function() {
            if (overlayCanvas) {
                overlayCanvas.width = window.innerWidth;
                overlayCanvas.height = window.innerHeight;
            }
        });
    }

    function initParticlePools() {
        var w = window.innerWidth;
        var h = window.innerHeight;

        for (var i = 0; i < SAND_COUNT; i++) {
            sandX[i] = Math.random() * w;
            sandY[i] = Math.random() * h;
            sandZ[i] = 0.15 + Math.random() * 0.85;
            sandSize[i] = (0.75 + Math.random() * 2.4) * sandZ[i];
            sandType[i] = Math.random() > 0.82 ? 2 : (Math.random() > 0.38 ? 1 : 0);
            sandLife[i] = Math.random() * 200;
            sandMaxLife[i] = 120 + Math.random() * 260;
        }

        for (var j = 0; j < SAND_RAIN_COUNT; j++) {
            rainX[j] = Math.random() * w;
            rainY[j] = Math.random() * h;
            rainLen[j] = 14.0 + Math.random() * 32.0;
            rainSpeed[j] = 18.0 + Math.random() * 24.0;
            rainAlpha[j] = 0.25 + Math.random() * 0.55;
            rainWidth[j] = 1.0 + Math.random() * 1.8;
        }

        for (var k = 0; k < WATER_COUNT; k++) {
            waterX[k] = Math.random() * w;
            waterY[k] = Math.random() * h;
            waterRadius[k] = 1.5 + Math.random() * 3.8;
            waterActive[k] = Math.random() > 0.4 ? 1 : 0;
        }

        sparks = [];
        for (var s = 0; s < SPARK_COUNT; s++) {
            sparks.push({
                active: false,
                life: 0,
                maxLife: 0,
                points: []
            });
        }
    }

    function getForwardCoordinate(distanceMeters) {
        var lla = geofs.aircraft.instance.llaLocation;
        var lat1 = lla[0];
        var lon1 = lla[1];
        var heading = 0;

        if (geofs.animation && geofs.animation.values && typeof geofs.animation.values.heading360 === 'number') {
            heading = geofs.animation.values.heading360;
        } else if (geofs.aircraft.instance.htr) {
            heading = geofs.aircraft.instance.htr[0];
        }

        var rad = Math.PI / 180.0;
        var deg = 180.0 / Math.PI;
        var R = 6378137.0;
        var d = distanceMeters;
        var lat1Rad = lat1 * rad;
        var lon1Rad = lon1 * rad;
        var brngRad = heading * rad;

        var lat2Rad = Math.asin(
            Math.sin(lat1Rad) * Math.cos(d / R) +
            Math.cos(lat1Rad) * Math.sin(d / R) * Math.cos(brngRad)
        );
        var lon2Rad = lon1Rad + Math.atan2(
            Math.sin(brngRad) * Math.sin(d / R) * Math.cos(lat1Rad),
            Math.cos(d / R) - Math.sin(lat1Rad) * Math.sin(lat2Rad)
        );

        var targetLat = lat2Rad * deg;
        var targetLon = lon2Rad * deg;

        var carto = Cesium.Cartographic.fromDegrees(targetLon, targetLat);
        var groundHeight = geofs.api.viewer.scene.globe.getHeight(carto);
        if (groundHeight === undefined || groundHeight === null || isNaN(groundHeight)) {
            var altMsl = geofs.aircraft.instance.altitudeMeters || 0;
            var agl = (geofs.animation && geofs.animation.values && geofs.animation.values.altitudeAGL) ? geofs.animation.values.altitudeAGL : 0;
            groundHeight = Math.max(0, altMsl - agl);
        }

        return {
            lat: targetLat,
            lon: targetLon,
            alt: groundHeight,
            headingRad: brngRad
        };
    }

    function buildModelResource(url) {
        return new Cesium.Resource({
            url: url,
            extension: 'glb',
            headers: {
                'Accept': 'model/gltf-binary,*/*'
            }
        });
    }

    function computeModelMatrix(lon, lat, alt, headingRad) {
        var cartesian = Cesium.Cartesian3.fromDegrees(lon, lat, alt);
        var hpr = new Cesium.HeadingPitchRoll(headingRad + Math.PI, 0.0, 0.0);
        return Cesium.Transforms.headingPitchRollToFixedFrame(cartesian, hpr);
    }

    function spawn3DModel(pos) {
        var scene = geofs.api.viewer.scene;
        var modelMatrix = computeModelMatrix(pos.lon, pos.lat, pos.alt, pos.headingRad);
        var primaryResource = stormState.customResource || buildModelResource(MODEL_CDN_URL);

        var modelOptions = {
            url: primaryResource,
            modelMatrix: modelMatrix,
            scale: 5.4,
            minimumPixelSize: 256,
            allowPicking: false,
            asynchronous: true
        };

        function onModelReady(loadedModel) {
            stormModelPrimitive = loadedModel;
            scene.primitives.add(stormModelPrimitive);
            if (stormModelPrimitive.activeAnimations) {
                stormModelPrimitive.activeAnimations.addAll({
                    loop: Cesium.ModelAnimationLoop.REPEAT
                });
            }
        }

        function tryFallbackChain() {
            var secondaryResource = buildModelResource(MODEL_RAW_URL);
            var secOpts = {
                url: secondaryResource,
                modelMatrix: modelMatrix,
                scale: 5.4,
                minimumPixelSize: 256,
                allowPicking: false,
                asynchronous: true
            };

            if (typeof Cesium.Model.fromGltfAsync === 'function') {
                Cesium.Model.fromGltfAsync(secOpts).then(onModelReady).catch(function() {
                    tryLocalServer(modelMatrix, pos);
                });
            } else {
                try {
                    var m = Cesium.Model.fromGltf(secOpts);
                    scene.primitives.add(m);
                    if (m.readyPromise) {
                        m.readyPromise.then(function(loaded) {
                            stormModelPrimitive = loaded;
                            if (stormModelPrimitive.activeAnimations) {
                                stormModelPrimitive.activeAnimations.addAll({
                                    loop: Cesium.ModelAnimationLoop.REPEAT
                                });
                            }
                        }).catch(function() {
                            scene.primitives.remove(m);
                            tryLocalServer(modelMatrix, pos);
                        });
                    }
                } catch(err) {
                    tryLocalServer(modelMatrix, pos);
                }
            }
        }

        function tryLocalServer(matrix, p) {
            var localResource = buildModelResource(MODEL_LOCAL_URL);
            var locOpts = {
                url: localResource,
                modelMatrix: matrix,
                scale: 5.4,
                minimumPixelSize: 256,
                allowPicking: false,
                asynchronous: true
            };

            if (typeof Cesium.Model.fromGltfAsync === 'function') {
                Cesium.Model.fromGltfAsync(locOpts).then(onModelReady).catch(function() {
                    spawnVolumetricWall(p);
                });
            } else {
                try {
                    var lm = Cesium.Model.fromGltf(locOpts);
                    scene.primitives.add(lm);
                    if (lm.readyPromise) {
                        lm.readyPromise.then(function(loaded) {
                            stormModelPrimitive = loaded;
                            if (stormModelPrimitive.activeAnimations) {
                                stormModelPrimitive.activeAnimations.addAll({
                                    loop: Cesium.ModelAnimationLoop.REPEAT
                                });
                            }
                        }).catch(function() {
                            scene.primitives.remove(lm);
                            spawnVolumetricWall(p);
                        });
                    }
                } catch(e) {
                    spawnVolumetricWall(p);
                }
            }
        }

        if (typeof Cesium.Model.fromGltfAsync === 'function') {
            Cesium.Model.fromGltfAsync(modelOptions).then(onModelReady).catch(tryFallbackChain);
        } else {
            try {
                var model = Cesium.Model.fromGltf(modelOptions);
                scene.primitives.add(model);
                if (model.readyPromise) {
                    model.readyPromise.then(function(loaded) {
                        stormModelPrimitive = loaded;
                        if (stormModelPrimitive.activeAnimations) {
                            stormModelPrimitive.activeAnimations.addAll({
                                loop: Cesium.ModelAnimationLoop.REPEAT
                            });
                        }
                    }).catch(function() {
                        scene.primitives.remove(model);
                        tryFallbackChain();
                    });
                }
            } catch(e) {
                tryFallbackChain();
            }
        }
    }

    function spawnVolumetricWall(p) {
        var entities = geofs.api.viewer.entities;
        var cartesianPos = Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.alt);
        stormEntity = entities.add({
            position: cartesianPos,
            cylinder: {
                length: 7500.0,
                topRadius: 21000.0,
                bottomRadius: 15000.0,
                material: new Cesium.Color(0.89, 0.62, 0.28, 0.92),
                slices: 64
            }
        });
    }

    function respawnModel() {
        var scene = geofs.api.viewer.scene;
        if (stormModelPrimitive) {
            scene.primitives.remove(stormModelPrimitive);
            stormModelPrimitive = null;
        }
        if (stormEntity) {
            geofs.api.viewer.entities.remove(stormEntity);
            stormEntity = null;
        }
        spawn3DModel({
            lat: stormState.stormLat,
            lon: stormState.stormLon,
            alt: stormState.stormAlt,
            headingRad: stormState.headingRad
        });
    }

    function activateAtmosphere() {
        var scene = geofs.api.viewer.scene;
        var tier = STORM_TIERS[stormState.tierIndex];
        scene.fog.enabled = true;
        scene.fog.density = tier.fogDensity;
        scene.fog.screenSpaceErrorFactor = 1.4;
        scene.fog.minimumBrightness = 0.85;

        scene.globe.atmosphereHueShift = 0.05;
        scene.globe.atmosphereSaturationShift = 0.65;
        scene.globe.atmosphereBrightnessShift = 0.18;
        scene.globe.baseColor = Cesium.Color.fromCssColorString('rgb(240, 168, 75)');

        if (scene.light) {
            scene.light.color = Cesium.Color.fromCssColorString('rgb(255, 218, 145)');
        }

        if (scene.skyAtmosphere) {
            scene.skyAtmosphere.hueShift = 0.05;
            scene.skyAtmosphere.saturationShift = 0.70;
            scene.skyAtmosphere.brightnessShift = 0.20;
        }

        var shaderGLSL =
            'uniform sampler2D colorTexture;' +
            'uniform float u_intensity;' +
            'uniform float u_time;' +
            'uniform float u_flash;' +
            'varying vec2 v_textureCoordinates;' +
            'void main(void) {' +
            '    vec2 uv = v_textureCoordinates;' +
            '    vec4 sceneColor = texture2D(colorTexture, uv);' +
            '    float grain = fract(sin(dot(uv * 1200.0 + fract(u_time * 29.0), vec2(12.9898, 78.233))) * 43758.5453) - 0.5;' +
            '    vec3 duneAmber = vec3(1.28, 0.95, 0.52);' +
            '    vec3 dustBloom = vec3(0.48, 0.30, 0.12);' +
            '    vec3 spiceGaze = sceneColor.rgb * duneAmber + dustBloom;' +
            '    vec3 graded = mix(sceneColor.rgb, spiceGaze, 0.92);' +
            '    graded += vec3(grain * 0.09);' +
            '    vec3 staticFlash = vec3(0.35, 0.48, 0.65) * u_flash;' +
            '    graded += staticFlash;' +
            '    gl_FragColor = vec4(graded, sceneColor.a);' +
            '}';

        postProcessStage = new Cesium.PostProcessStage({
            fragmentShader: shaderGLSL,
            uniforms: {
                u_intensity: function() {
                    return 1.0;
                },
                u_time: function() {
                    return (Date.now() - stormState.startTime) * 0.001;
                },
                u_flash: function() {
                    return stormState.flashActive;
                }
            }
        });

        scene.postProcessStages.add(postProcessStage);
    }

    function spawnTriboelectricSpark(w, h) {
        var startX = Math.random() * w;
        var startY = Math.random() * (h * 0.6);
        var pts = [{ x: startX, y: startY }];
        var segments = 6 + Math.floor(Math.random() * 8);
        var curX = startX;
        var curY = startY;

        for (var i = 0; i < segments; i++) {
            curX += (Math.random() - 0.5) * 45.0;
            curY += 15.0 + Math.random() * 35.0;
            pts.push({ x: curX, y: curY });
        }

        for (var s = 0; s < sparks.length; s++) {
            if (!sparks[s].active) {
                sparks[s].active = true;
                sparks[s].life = 0;
                sparks[s].maxLife = 4 + Math.floor(Math.random() * 5);
                sparks[s].points = pts;
                break;
            }
        }
    }

    function runParticleEngine() {
        function render() {
            if (!stormState.active) {
                if (overlayCtx) {
                    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
                }
                return;
            }

            var w = overlayCanvas.width;
            var h = overlayCanvas.height;
            var tier = STORM_TIERS[stormState.tierIndex];

            overlayCtx.clearRect(0, 0, w, h);

            var airspeed = (geofs.animation && geofs.animation.values && typeof geofs.animation.values.airspeed === 'number')
                ? geofs.animation.values.airspeed
                : 0;

            var speedRatio = Math.max(0.3, airspeed / 180.0);
            var baseStreak = 6.0 + speedRatio * 44.0;
            var lateralDrift = speedRatio * 26.0 + 4.0;

            var rainFactor = tier.sandRainDensity;
            overlayCtx.strokeStyle = 'rgba(215, 145, 65, ' + (0.65 * rainFactor) + ')';
            overlayCtx.beginPath();
            for (var rIdx = 0; rIdx < SAND_RAIN_COUNT; rIdx++) {
                rainY[rIdx] += rainSpeed[rIdx] * (1.0 + speedRatio * 1.8);
                rainX[rIdx] -= (lateralDrift * 0.45);

                if (rainY[rIdx] > h + 40 || rainX[rIdx] < -40) {
                    rainY[rIdx] = -40;
                    rainX[rIdx] = Math.random() * (w * 1.2);
                }

                var rLen = rainLen[rIdx] * (1.0 + speedRatio * 2.2);
                overlayCtx.lineWidth = rainWidth[rIdx];
                overlayCtx.moveTo(rainX[rIdx], rainY[rIdx]);
                overlayCtx.lineTo(rainX[rIdx] + (speedRatio * 8.0), rainY[rIdx] + rLen);
            }
            overlayCtx.stroke();

            overlayCtx.fillStyle = 'rgba(240, 175, 75, 0.75)';
            overlayCtx.beginPath();
            for (var i = 0; i < SAND_COUNT; i++) {
                sandLife[i]++;
                var z = sandZ[i];
                sandX[i] -= (lateralDrift + (Math.random() - 0.5) * 1.5) * z;
                sandY[i] += (speedRatio * 6.0 + 1.5) * z;

                if (sandX[i] < -80 || sandY[i] > h + 80 || sandLife[i] > sandMaxLife[i]) {
                    sandX[i] = w + Math.random() * 60;
                    sandY[i] = Math.random() * (h * 0.85);
                    sandLife[i] = 0;
                }

                if (sandType[i] === 0) {
                    overlayCtx.moveTo(sandX[i], sandY[i]);
                    overlayCtx.arc(sandX[i], sandY[i], sandSize[i], 0, Math.PI * 2);
                }
            }
            overlayCtx.fill();

            overlayCtx.strokeStyle = 'rgba(255, 215, 115, 0.75)';
            overlayCtx.lineWidth = 1.9;
            overlayCtx.beginPath();
            for (var j = 0; j < SAND_COUNT; j++) {
                if (sandType[j] === 1) {
                    var strLen = baseStreak * sandZ[j];
                    overlayCtx.moveTo(sandX[j], sandY[j]);
                    overlayCtx.lineTo(sandX[j] + strLen, sandY[j] - (strLen * 0.28));
                }
            }
            overlayCtx.stroke();

            overlayCtx.fillStyle = 'rgba(185, 115, 45, 0.85)';
            for (var k = 0; k < SAND_COUNT; k++) {
                if (sandType[k] === 2) {
                    overlayCtx.fillRect(sandX[k], sandY[k], sandSize[k] * 2.4, sandSize[k] * 1.6);
                }
            }

            var waterAirInfluence = (airspeed / 160.0) * tier.waterIntensity;
            if (waterAirInfluence > 0.005) {
                overlayCtx.fillStyle = 'rgba(255, 255, 255, 0.58)';
                overlayCtx.strokeStyle = 'rgba(230, 248, 255, 0.75)';
                overlayCtx.lineWidth = 2.0;

                overlayCtx.beginPath();
                for (var m = 0; m < WATER_COUNT; m++) {
                    if (waterActive[m] === 1) {
                        var flowX = -(waterAirInfluence * 16.0 + 0.4);
                        var flowY = (waterAirInfluence * 4.0 + 0.6);

                        waterX[m] += flowX;
                        waterY[m] += flowY;

                        var r = waterRadius[m];
                        var streak = waterAirInfluence * 20.0;

                        if (waterX[m] < -50 || waterY[m] > h + 50) {
                            waterX[m] = Math.random() * (w * 1.1);
                            waterY[m] = Math.random() * (h * 0.5);
                        }

                        overlayCtx.moveTo(waterX[m], waterY[m]);
                        overlayCtx.arc(waterX[m], waterY[m], r, 0, Math.PI * 2);

                        if (streak > 2.0) {
                            overlayCtx.moveTo(waterX[m], waterY[m]);
                            overlayCtx.lineTo(waterX[m] + streak, waterY[m] - (streak * 0.22));
                        }
                    }
                }
                overlayCtx.fill();
                overlayCtx.stroke();
            }

            for (var sIdx = 0; sIdx < sparks.length; sIdx++) {
                var sp = sparks[sIdx];
                if (sp.active) {
                    sp.life++;
                    if (sp.life >= sp.maxLife) {
                        sp.active = false;
                    } else {
                        overlayCtx.strokeStyle = 'rgba(210, 245, 255, 0.9)';
                        overlayCtx.lineWidth = 2.4;
                        overlayCtx.beginPath();
                        for (var pIdx = 0; pIdx < sp.points.length; pIdx++) {
                            var pt = sp.points[pIdx];
                            if (pIdx === 0) {
                                overlayCtx.moveTo(pt.x, pt.y);
                            } else {
                                overlayCtx.lineTo(pt.x, pt.y);
                            }
                        }
                        overlayCtx.stroke();
                    }
                }
            }

            animFrameId = requestAnimationFrame(render);
        }

        animFrameId = requestAnimationFrame(render);
    }

    function sampleOctaveNoise(t, seed) {
        var o1 = Math.sin(t * 1.8 + seed);
        var o2 = Math.sin(t * 4.7 + seed * 2.3) * 0.55;
        var o3 = Math.sin(t * 10.9 + seed * 4.9) * 0.28;
        var o4 = Math.sin(t * 22.1 + seed * 8.7) * 0.12;
        return (o1 + o2 + o3 + o4) / 1.95;
    }

    function updatePhysicsFrame() {
        if (!stormState.active) {
            return;
        }

        var now = Date.now();
        var dt = (now - stormState.lastUpdateTime) * 0.001;
        if (dt > 1.0) {
            dt = 0.016;
        }
        stormState.lastUpdateTime = now;

        var currentTier = STORM_TIERS[stormState.tierIndex];
        var tierWind = currentTier.baseWind + (currentTier.gustWind - currentTier.baseWind) * 0.85;
        var visMeters = currentTier.visMeters;
        var visibilityPct = Math.round((visMeters / 5000.0) * 100);
        var waterPct = Math.round(currentTier.waterIntensity * 98);
        var sandRainPct = Math.round(currentTier.sandRainDensity * 100);

        hudElements.distanceVal.textContent = 'ACTIVE (LOCKED)';
        hudElements.visibilityVal.textContent = visibilityPct + '% (' + Math.round(visMeters) + ' m)';
        hudElements.windVal.textContent = Math.round(tierWind) + ' kts';
        hudElements.sandRainVal.textContent = sandRainPct + '%';
        hudElements.waterVal.textContent = waterPct + '%';

        var airspeed = (geofs.animation && geofs.animation.values && typeof geofs.animation.values.airspeed === 'number')
            ? geofs.animation.values.airspeed
            : 120.0;

        stormState.sandAccumulation = Math.min(1.0, stormState.sandAccumulation + dt * 0.08);

        var timeSec = (now - stormState.startTime) * 0.001;
        var aeroLoad = (Math.min(airspeed, 420.0) / 110.0) * currentTier.turbulenceLoad;

        var gJitter = (sampleOctaveNoise(timeSec * 1.5, 5.5) * aeroLoad * 0.75);
        var totalG = 1.0 + gJitter;
        hudElements.gLoadVal.textContent = (totalG >= 0 ? '+' : '') + totalG.toFixed(2) + ' G';

        var pitchTorque = sampleOctaveNoise(timeSec, 1.25) * aeroLoad * 7400.0;
        var rollTorque = sampleOctaveNoise(timeSec, 3.82) * aeroLoad * 9800.0;
        var yawTorque = sampleOctaveNoise(timeSec, 6.41) * aeroLoad * 5200.0;
        var verticalImpulse = sampleOctaveNoise(timeSec, 9.15) * aeroLoad * 11500.0;
        var lateralImpulse = sampleOctaveNoise(timeSec, 4.33) * aeroLoad * 5800.0;

        var rb = geofs.aircraft.instance.rigidBody;
        if (rb) {
            if (window.Ammo && typeof Ammo.btVector3 === 'function') {
                if (rb.applyTorqueImpulse) {
                    var tVec = new Ammo.btVector3(pitchTorque, yawTorque, rollTorque);
                    rb.applyTorqueImpulse(tVec);
                    Ammo.destroy(tVec);
                }
                if (rb.applyCentralImpulse) {
                    var fVec = new Ammo.btVector3(lateralImpulse, verticalImpulse, 0.0);
                    rb.applyCentralImpulse(fVec);
                    Ammo.destroy(fVec);
                }
            }
            if (rb.v_angularVelocity) {
                rb.v_angularVelocity[0] += (pitchTorque * 0.000004);
                rb.v_angularVelocity[1] += (rollTorque * 0.000004);
                rb.v_angularVelocity[2] += (yawTorque * 0.000003);
            }
        }

        var shakeAmp = (Math.min(airspeed, 400.0) / 140.0 + 0.3) * 0.0042 * currentTier.turbulenceLoad;
        if (geofs.camera && geofs.camera.currentDefinition && geofs.camera.currentDefinition.offsets) {
            geofs.camera.currentDefinition.offsets[0] += (Math.random() - 0.5) * shakeAmp;
            geofs.camera.currentDefinition.offsets[1] += (Math.random() - 0.5) * shakeAmp;
            geofs.camera.currentDefinition.offsets[2] += (Math.random() - 0.5) * shakeAmp;
        }
        if (geofs.api.viewer && geofs.api.viewer.camera) {
            geofs.api.viewer.camera.twistRight((Math.random() - 0.5) * shakeAmp * 0.45);
        }

        if (currentTier.flashFreq > 0 && Math.random() < currentTier.flashFreq * dt * 4.0) {
            stormState.flashActive = 1.0;
            spawnTriboelectricSpark(overlayCanvas.width, overlayCanvas.height);
        } else {
            stormState.flashActive = Math.max(0.0, stormState.flashActive - dt * 4.5);
        }

        if (stormState.hudVisible) {
            var uiShakePixels = (Math.min(airspeed, 360.0) / 70.0 + 0.5) * currentTier.shakeScale;
            var uiShakeX = (Math.random() - 0.5) * uiShakePixels;
            var uiShakeY = (Math.random() - 0.5) * uiShakePixels;
            var uiRot = (Math.random() - 0.5) * (currentTier.shakeScale * 0.35);
            hudElements.container.style.transform = 'translate3d(' + uiShakeX.toFixed(2) + 'px, ' + uiShakeY.toFixed(2) + 'px, 0px) rotate(' + uiRot.toFixed(2) + 'deg)';

            var accum = stormState.sandAccumulation;
            var borderR = Math.round(45 + accum * 140);
            var borderG = Math.round(32 + accum * 80);
            var borderB = Math.round(22 + accum * 20);
            hudElements.container.style.borderColor = 'rgba(' + borderR + ',' + borderG + ',' + borderB + ', 0.9)';
            hudElements.container.style.boxShadow = '0 20px 60px rgba(0,0,0,0.96), inset 0 0 ' + Math.round(accum * 35) + 'px rgba(215, 135, 45, ' + (accum * 0.5).toFixed(2) + ')';
            hudElements.container.classList.add('sand-coated');
        }
    }

    function startDisaster() {
        var horizonPos = getForwardCoordinate(6000.0);
        stormState.stormLat = horizonPos.lat;
        stormState.stormLon = horizonPos.lon;
        stormState.stormAlt = horizonPos.alt;
        stormState.headingRad = horizonPos.headingRad;
        stormState.startTime = Date.now();
        stormState.lastUpdateTime = Date.now();
        stormState.sandAccumulation = 0;
        stormState.active = true;

        spawn3DModel(horizonPos);
        activateAtmosphere();
        runParticleEngine();

        geofs.api.addFrameCallback(updatePhysicsFrame, 'geofs_haboob_sim');

        hudElements.statusVal.textContent = 'ONLINE (LOCKED)';
        hudElements.statusVal.style.color = '#ffa442';
        hudElements.startBtn.classList.add('active');
    }

    function stopDisaster() {
        stormState.active = false;
        stormState.sandAccumulation = 0;
        stormState.flashActive = 0;

        geofs.api.removeFrameCallback('geofs_haboob_sim');

        if (animFrameId) {
            cancelAnimationFrame(animFrameId);
            animFrameId = null;
        }

        if (overlayCtx) {
            overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        }

        var scene = geofs.api.viewer.scene;

        if (stormModelPrimitive) {
            scene.primitives.remove(stormModelPrimitive);
            stormModelPrimitive = null;
        }

        if (stormEntity) {
            geofs.api.viewer.entities.remove(stormEntity);
            stormEntity = null;
        }

        if (postProcessStage) {
            scene.postProcessStages.remove(postProcessStage);
            postProcessStage = null;
        }

        if (stormState.originalFog) {
            scene.fog.enabled = stormState.originalFog.enabled;
            scene.fog.density = stormState.originalFog.density;
            scene.fog.screenSpaceErrorFactor = stormState.originalFog.screenSpaceErrorFactor;
            scene.fog.minimumBrightness = stormState.originalFog.minimumBrightness;
        }

        if (stormState.originalAtmosphere) {
            if (stormState.originalAtmosphere.baseColor) {
                scene.globe.baseColor = stormState.originalAtmosphere.baseColor;
            }
            scene.globe.atmosphereHueShift = stormState.originalAtmosphere.hue;
            scene.globe.atmosphereSaturationShift = stormState.originalAtmosphere.sat;
            scene.globe.atmosphereBrightnessShift = stormState.originalAtmosphere.bri;

            if (scene.skyAtmosphere) {
                scene.skyAtmosphere.hueShift = stormState.originalAtmosphere.skyHue;
                scene.skyAtmosphere.saturationShift = stormState.originalAtmosphere.skySat;
                scene.skyAtmosphere.brightnessShift = stormState.originalAtmosphere.skyBri;
            }
        }

        if (stormState.originalLight && scene.light) {
            scene.light.color = stormState.originalLight;
        }

        hudElements.container.style.transform = 'none';
        hudElements.container.classList.remove('sand-coated');
        hudElements.container.style.borderColor = '#2d2016';
        hudElements.container.style.boxShadow = '0 20px 60px rgba(0,0,0,0.96)';
        hudElements.statusVal.textContent = 'OFFLINE';
        hudElements.statusVal.style.color = '#634b39';
        hudElements.distanceVal.textContent = 'STANDBY';
        hudElements.visibilityVal.textContent = '100% (---)';
        hudElements.windVal.textContent = '---';
        hudElements.sandRainVal.textContent = '0%';
        hudElements.gLoadVal.textContent = '+1.00 G';
        hudElements.waterVal.textContent = '0%';
        hudElements.startBtn.classList.remove('active');
    }

    awaitEngine();
})();
