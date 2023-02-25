// pixel dimensions of enclosing DIV element
let priceDivHeight = $("#priceHist").height();
let priceDivWidth = $("#priceHist").width();
let volDivHeight = $("#volHist").height();
let volDivWidth = $("#volHist").width();

const buttonFadedColor = "#bebebe";
const loserRed = "#ffb4b4";
const gainerGreen = "#b4ffb4";
const loserRedRect = "#ff7c6d";
const gainerGreenRect = "#00ff00";
const defaultGray = "#dedede";
const btnBuy = document.getElementById("Buy");
const btnShort = document.getElementById("Short");
const btnNextChart = document.getElementById("nextChart");
const btnAdv1 = document.getElementById("advanceOneBar");
const btnAdv5 = document.getElementById("advanceFiveBars");
const txtBoxFindSym = document.getElementById("findSym");
const buttonDefaultColor = btnShort.style.backgroundColor;
btnBuy.disabled = true;
btnBuy.style.backgroundColor = buttonFadedColor;
btnShort.disabled = true;
btnShort.style.backgroundColor = buttonFadedColor;
btnAdv1.disabled = true;
btnAdv1.style.backgroundColor = buttonFadedColor;
btnAdv5.disabled = true;
btnAdv5.style.backgroundColor = buttonFadedColor;
btnNextChart.disabled = true;
btnNextChart.style.backgroundColor = buttonFadedColor;

const minFactor = 1.5; // the full height of the container represents at least a __ in price
const squishTop = 0.13; // leave a fraction for market line (bigger means mkt line comes down further)
const bottomPad = 25; // a few pixels of padding at the bottom
const rightPad = 90; // pixels
const priceHorizSpacing = 4; // center-to-center pixel spacing between bars
const minHist = 60; // minimum number of bars to show on a chart
const minToPlay = 30; // min num bars available for play (refer to server side)
const labeledPriceGLineInterval = 4; // indicates to label the Nth gridline with price data
let screenCapacity = Math.ceil((priceDivWidth - rightPad) / priceHorizSpacing);

let sym = '';
let inLongPosition = false;
let inShortPosition = false;
let dates = null;
let op = null;
let hi = null;
let lo = null;
let cl = null;
let vol = null;
let sqrtVol = null;
let SP500dates = null;
let SP500cl = null;
let priceSMA50 = [];
let priceSMA200 = [];
let volSMA50 = [];
let slope = null;
let intercept = null;

let cumulativeChartPL = 1.0;
// the two variables below apply only to the current chart
let chartPLs = []; // holds PLs for each position on this chart
let positionBars = []; // holds arrays of [entry bar, exit bar] for each position
let positionRects = []; // holds HTML ids of PL rectangle Paths
let priceGLineLabels = []; // holds ids of price gridline labels
let currentBar = 0;
let readyToAdvance = true;
let overallPL = 1.0;
let storedCookie = document.cookie.split('=');
if (storedCookie[0] === 'overallPL') {
    overallPL = parseFloat(storedCookie[1]);
}

drawGridlines();

let barPctTxtAnchor = document.getElementById("barPctTxt");
barPctTxtAnchor.x.baseVal[0].valueAsString = (priceDivWidth - 2).toString() + 'px';
drawRect(priceDivWidth - 42, 0, priceDivWidth, 15, '#ffffff', 'barPctTxtPath', 'inFront', 1);


// request market data, currently SP500 only but could add to "data" property
$.ajax({
    url: '/PracticeTrading/getMkt/',
    type: 'GET',
    data: {'mkt': 'SP500'},
    contentType: 'application/json; charset=utf-8',
    success: function (response) {
        SP500dates = response.sp500_dates;
        SP500cl = response.sp500_cl;
        nextChart(''); // start by plotting a random chart
    },
    error: function (error) {
        console.log(error);
        alert("Internal error. Probably lost the connection to the database. If a new chart doesn't render after you close this message, please try reloading the page.");
    }
});

document.getElementsByTagName("BODY")[0].onresize = function() {reDraw();};
function reDraw() {
    priceDivHeight = $("#priceHist").height();
    priceDivWidth = $("#priceHist").width();
    volDivHeight = $("#volHist").height();
    volDivWidth = $("#volHist").width();
    screenCapacity = Math.ceil((priceDivWidth - rightPad) / priceHorizSpacing);
    drawGridlines();
    calculateChartGraphics();
    barPctTxtAnchor.x.baseVal[0].valueAsString = (priceDivWidth - 2).toString() + 'px';
    let whiteRect = document.getElementById('barPctTxtPath');
    let x0 = priceDivWidth - 42;
    let y0 = 0;
    let x1 =priceDivWidth;
    let y1 = 15;
    let newPath = `M${x0} ${y0} L${x0} ${y1} L${x1} ${y1} L${x1} ${y0} L${x0} ${y0}`;
    whiteRect.setAttribute('d', newPath);
}

function drawRect(x0, y0, x1, y1, color, pathID, position, initialVis) {
    let newG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    newG.setAttribute('fill', color);
    newG.setAttribute('font-family', 'Arial');
    newG.setAttribute('font-size', '8pt');
    newG.setAttribute('stroke', 'none');
    newG.setAttribute('stroke-width', '1');
    if (initialVis === 0) {
        newG.setAttribute('visibility', 'hidden');
    }

    let newPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    let pathD = `M${x0} ${y0} L${x0} ${y1} L${x1} ${y1} L${x1} ${y0} L${x0} ${y0}`;
    newPath.setAttribute('id', pathID);
    newPath.setAttribute('d', pathD);

    newG.appendChild(newPath);

    if (position === 'inFront') {
        document.getElementById("rectsInFront").appendChild(newG);
    } else {
        newG.setAttribute('opacity', '0.4');
        document.getElementById("rectsBehind").appendChild(newG);
    }
}

function getSMA(x, n) {
    const len = x.length;
    const smaOut = new Array(len);
    for (let i = 0; i < len - 1; i++) {
        let tmp = 0.0;
        let lmt = Math.min(n - 1, len - 1 - i);
        for (let j = 0; j <= lmt; j++) {
            tmp += x[i + j];
        }
        smaOut[i] = tmp / (lmt + 1);
    }
    smaOut[len - 1] = x[len - 1];
    return smaOut;
}

function randInt(min, max) {
    return Math.floor(Math.random() * (max - min)) + min;
}

function round(value, decimals) {
    return Number(Math.round(value + 'e' + decimals) + 'e-' + decimals);
}

function arrayRound(arrayOfVals, decimals) {
    let newArray = new Array(arrayOfVals.length);
    for (let i = 0; i < arrayOfVals.length; i++) {
        newArray[i] = round(arrayOfVals[i], decimals);
    }
    return newArray;
}

function arrayMean(arrayOfVals) {
    let tot = 0;
    for (let value of arrayOfVals) {
        tot += value;
    }
    return (tot / arrayOfVals.length);
}

function mean_stdev(arrayOfVals) {
    let mean = arrayMean(arrayOfVals);
    let tot = 0;
    for (let value of arrayOfVals) {
        tot += Math.pow(value - mean, 2);
    }
    tot = tot / (arrayOfVals.length - 1);
    return [mean, Math.sqrt(tot)];
}

function arraySqrt(vals) {
    let newVals = new Array(vals.length);
    for (let i = 0; i < vals.length; i++) {
        newVals[i] = Math.sqrt(vals[i]);
    }
    return newVals;
}

function arrayMin(arry) {
    let min = arry[0];
    for (let i = 1; i < arry.length; i++) {
        if (arry[i] < min) {
            min = arry[i];
        }
    }
    return min;
}

function arrayMax(arry) {
    let max = arry[0];
    for (let i = 1; i < arry.length; i++) {
        if (arry[i] > max) {
            max = arry[i];
        }
    }
    return max;
}

function priceToPixel(n) {
    let p = round(1. * n * slope + intercept, 2);
    return p;
}

function barToPixel(n) {
    let barDelta = n - currentBar;
    let p = priceDivWidth - rightPad - barDelta * priceHorizSpacing;
    return p;
}

function clearPLrects() {
    grandParent = document.getElementById('rectsBehind');
    while (grandParent.hasChildNodes()) {
        grandParent.removeChild(grandParent.lastChild);
    }
}

function clearPriceGLineLabels() {
    grandParent = document.getElementById('priceGLineLabels');
    while (grandParent.hasChildNodes()) {
        grandParent.removeChild(grandParent.lastChild);
    }
}

function generatePriceGLineLabel(x, y) {
    let labelID = 'PGLineLabel' + priceGLineLabels.length.toString();
    priceGLineLabels.push(labelID);

    let newG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    newG.setAttribute('fill', '#000000');
    newG.setAttribute('font-family', 'Arial');
    newG.setAttribute('font-size', '12pt');

    let newText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    newText.setAttribute('id', labelID);
    newText.setAttribute('text-anchor', 'start');
    newText.setAttribute('x', x.toString() + 'px');
    newText.setAttribute('y', y.toString() + 'px');

    newG.appendChild(newText);
    document.getElementById("priceGLineLabels").appendChild(newG);
}

function generatePLrect() {
    let x0 = barToPixel(positionBars[0][0]);
    let y0 = priceToPixel(op[positionBars[0][0]]); // position entry price
    let x1 = barToPixel(positionBars[0][1]);
    let y1 = priceToPixel(op[positionBars[0][1]]); // position exit price
    let rectColor = null;
    if (chartPLs[0] >= 1) {
        rectColor = gainerGreenRect;
    } else {
        rectColor = loserRedRect;
    }
    let pathID = 'PLrect' + positionRects.length.toString();
    positionRects.unshift(pathID);
    drawRect(x0, y0, x1, y1, rectColor, pathID, 'rectsBehind', 0);
}

function updatePLrects() {
    // during a position there will be one less element in positionsRect than in
    // positionBars and chartPLs and since new elements are prepended, the
    // index correspondence between the rectangles and the PL history is aligned
    // from the end of the arrays going toward the front, but NOT the other way
    // around
    let nPos = positionBars.length - 1; // 0 indexed number of positions, including open ones
    let nRect = positionRects.length - 1; // also zero-indexed
    for (let i = 0; i <= nRect; i++) {
        let x0 = barToPixel(positionBars[nPos - i][0]);
        let y0 = priceToPixel(op[positionBars[nPos - i][0]]); // position entry price
        let x1 = barToPixel(positionBars[nPos - i][1]);
        let y1 = priceToPixel(op[positionBars[nPos - i][1]]); // position exit price
        let pathD = `M${x0} ${y0} L${x0} ${y1} L${x1} ${y1} L${x1} ${y0} L${x0} ${y0}`;
        let pathElem = document.getElementById(positionRects[nRect - i]);
        pathElem.setAttribute('d', pathD);
        pathElem.setAttribute('visibility', 'visible');
    }
}

$(document).ready(function(){
    $('#findSym').keyup(function(event) {
        const textElem = $('#findSym');
        if (event.keyCode === 13) {
            const requestedSym = textElem.val();
            textElem.val('');
            nextChart(requestedSym);
        } else {
            textElem.val(textElem.val().toUpperCase());
        }
    });
});

btnNextChart.onclick = function () {nextChart('');};
function nextChart(requestedSym) {

    if (/^[a-zA-Z]*$/.test(requestedSym) === false) {
        alert('Your search string contains illegal characters. Please search for symbols composed of only English letters.');
        return;
    }

    // in case someone uses "find" while in a position
    if (inLongPosition) {
        sellHoldings();
    } else if (inShortPosition) {
        coverShort();
    }

    // update the overall PL text
    if (chartPLs.length > 0) {
        let temp = 1.0;
        for (let chartPL of chartPLs) {
            temp *= chartPL;
        }
        overallPL *= temp; // reassign based on all activity on outgoing chart
        setCookie('overallPL', overallPL, 3650);
        chartPLs.length = 0;
        chartPLs = [];
        positionBars.length = 0;
        positionBars = [];
        positionRects.length = 0;
        positionRects = [];
        if (requestedSym.length > 0) {
            btnBuy.disabled = true;
            btnBuy.style.backgroundColor = buttonFadedColor;
            btnShort.disabled = true;
            btnShort.style.backgroundColor = buttonFadedColor;
            btnAdv1.disabled = true;
            btnAdv1.style.backgroundColor = buttonFadedColor;
            btnAdv5.disabled = true;
            btnAdv5.style.backgroundColor = buttonFadedColor;
            btnNextChart.style.backgroundColor = buttonFadedColor;
            readyToAdvance = true;
        }
    } else {
        readyToAdvance = true; // if we took no positions, don't bother displaying sym info
    }

    if (readyToAdvance) {
        btnNextChart.disabled = true; // if i dont do this, rapid clicking causes errors
        readyToAdvance = false;
        $.ajax({
            url: '/PracticeTrading/nextChart/',
            type: 'GET',
            data: {requested_sym: requestedSym},
            // contentType: 'application/json; charset=utf-8',
            success: function (response) {
                let status = response.status;
                if (status === 0) {
                    alert("Ticker symbol not found. Please try a different ticker.");
                    return;
                }

                sym = response.tickerSym;
                dates = response.dates;
                op = response.op;
                hi = response.hi;
                lo = response.lo;
                cl = response.cl;
                vol = response.vol;
                sqrtVol = arraySqrt(vol); // reduce peaks for plotting

                priceSMA50 = getSMA(cl, 50);
                priceSMA200 = getSMA(cl, 200);
                volSMA50 = getSMA(sqrtVol, 50);

                currentBar = randInt(minToPlay, cl.length - minHist);

                drawChart();

                btnBuy.disabled = false;
                btnBuy.style.backgroundColor = buttonDefaultColor;
                btnShort.disabled = false;
                btnShort.style.backgroundColor = buttonDefaultColor;
                btnAdv1.disabled = false;
                btnAdv1.style.backgroundColor = buttonDefaultColor;
                btnAdv5.disabled = false;
                btnAdv5.style.backgroundColor = buttonDefaultColor;

                if (requestedSym.length > 0) {
                    document.getElementById("symbolInfoSym").innerHTML = requestedSym;
                } else {
                    document.getElementById("symbolInfoSym").innerHTML = '';
                }
                document.getElementById("symbolInfoDate").innerHTML = '';
                clearPLrects();

                btnNextChart.style.backgroundColor = buttonDefaultColor;
                btnNextChart.disabled = false;
            },
            error: function (error) {
                console.log(error);
                btnNextChart.style.backgroundColor = buttonDefaultColor;
                btnNextChart.disabled = false;
            }
        });

    } else {
        btnBuy.disabled = true;
        btnBuy.style.backgroundColor = buttonFadedColor;
        btnShort.disabled = true;
        btnShort.style.backgroundColor = buttonFadedColor;
        btnAdv1.disabled = true;
        btnAdv1.style.backgroundColor = buttonFadedColor;
        btnAdv5.disabled = true;
        btnAdv5.style.backgroundColor = buttonFadedColor;
        readyToAdvance = true;
        let exitDate = new Date(dates[currentBar]);
        document.getElementById("symbolInfoSym").innerHTML = sym;
        document.getElementById("symbolInfoDate").innerHTML = (1 + exitDate.getUTCMonth()).toString() +
            '/' + exitDate.getUTCDate().toString() + '/' + exitDate.getUTCFullYear().toString();
    }
}

function drawChart() {

    // update existing positions
    if (inLongPosition) {
        chartPLs[0] = cl[currentBar] / op[positionBars[0][0]];
    } else if (inShortPosition) {
        chartPLs[0] = Math.max(0, 2 - cl[currentBar] / op[positionBars[0][0]]);
    }

    calculateChartGraphics();

    // display the % change from yesterday's close to today's close
    barPctTxtAnchor.innerHTML = round(100.0 * (cl[currentBar] / cl[currentBar + 1] - 1), 2).toString() + '%';

    let perfThisChart = 1.0; // total PL on the current chart
    for (let chartPL of chartPLs) {
        perfThisChart *= chartPL;
    }
    if (inLongPosition || inShortPosition) {
        document.getElementById("curPosPct").innerHTML = (round(100.0 * (chartPLs[0] - 1), 2)).toString() + '%';
        if (chartPLs[0] > 1.0) {
            document.getElementById("curPosPct").style.backgroundColor = gainerGreen;
        } else if (chartPLs[0] < 1.0) {
            document.getElementById("curPosPct").style.backgroundColor = loserRed;
        } else {
            document.getElementById("curPosPct").style.backgroundColor = defaultGray;
        }
    } else {
        document.getElementById("curPosPct").innerHTML = '0%';
        document.getElementById("curPosPct").style.backgroundColor = defaultGray;
    }
    document.getElementById("thisChartPct").innerHTML = (round(100.0 * (perfThisChart - 1), 2)).toString() + '%';
    document.getElementById("txtOverallPct").innerHTML = (round(100.0 * (perfThisChart * overallPL - 1), 2)).toString() + '%';

    // adjust colors
    let overallStatus = perfThisChart * overallPL;
    setCookie('overallPL', overallStatus, 3650);
    if (overallStatus > 1.0) {
        document.getElementById("txtOverallPct").style.backgroundColor = gainerGreen;
    } else if (overallStatus < 1.0) {
        document.getElementById("txtOverallPct").style.backgroundColor = loserRed;
    } else {
        document.getElementById("txtOverallPct").style.backgroundColor = defaultGray;
    }

    if (perfThisChart > 1.0) {
        document.getElementById("thisChartPct").style.backgroundColor = gainerGreen;
    } else if (perfThisChart < 1.0) {
        document.getElementById("thisChartPct").style.backgroundColor = loserRed;
    } else {
        document.getElementById("thisChartPct").style.backgroundColor = defaultGray;
    }

}

function calculateChartGraphics() {
    let oldestBar = Math.min(cl.length, currentBar + screenCapacity);
//    let datesPlt = dates.slice(currentBar, oldestBar);
    let opPlt = op.slice(currentBar, oldestBar);
    let hiPlt = hi.slice(currentBar, oldestBar);
    let loPlt = lo.slice(currentBar, oldestBar);
    let clPlt = cl.slice(currentBar, oldestBar);
    let volPlt = sqrtVol.slice(currentBar, oldestBar); // using sqrt of vol

    // make sure we are pulling SP500 data from the proper date.
    let alignedSP500index = false;
    alignedSP500index = SP500dates.findIndex(findIndexOfDate);

    let SP500oldestBar = Math.min(SP500cl.length, alignedSP500index + screenCapacity);
    let SP500clPlt = SP500cl.slice(alignedSP500index, SP500oldestBar);

    let priceSMA50plt = priceSMA50.slice(currentBar, oldestBar);
    let priceSMA200plt = priceSMA200.slice(currentBar, oldestBar);
    let volSMA50plt = volSMA50.slice(currentBar, oldestBar);

    // RESCALE PRICES and DETERMINE PRICE LABELS FOR GRIDLINES
    let yRange = ((1 - squishTop) * priceDivHeight - bottomPad) / 25; // H glines spaced by 25 pixels
    let minPrice = arrayMin(loPlt);
    if (minPrice < 20) {
        minPrice = Math.floor(minPrice * 10.0) / 10;
    } else {
        minPrice = Math.floor(minPrice);
    }
    let maxPrice = arrayMax(hiPlt);
    if (1. * maxPrice / minPrice < minFactor) {
        maxPrice = 1. * minFactor * minPrice;
    }
    maxPrice = Math.ceil(maxPrice);

    let spacing = (maxPrice - minPrice) / yRange;


//    if (Math.ceil(spacing) >= 5) {
//        spacing = Math.ceil(spacing);
//    } else {
//        // 'snap to' an aesthetically pleasing spacing
//        let allowedSpacings = [0.125, 0.25, 0.50, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.5, 4, 4.5, 5];
//        let prox = 1000;
//        let chosenIncrement = Math.ceil(spacing);
//        for (let i = 0; i < allowedSpacings.length; i++) {
//            if (allowedSpacings[i] >= spacing && allowedSpacings[i] - spacing < prox) {
//                prox = allowedSpacings[i] - spacing;
//                chosenIncrement = allowedSpacings[i];
//            }
//        }
//        spacing = chosenIncrement;
//    }
//
//    maxPrice = minPrice + yRange * spacing; // redefine max price for scaling


    // ASSIGN TEXT TO THE PRICE LABEL HTML ELEMENTS
    for (let i = 0; i < priceGLineLabels.length; i++) {
        let testElem = document.getElementById(priceGLineLabels[i]);
        let label = round(minPrice + i * labeledPriceGLineInterval * spacing, 2);
        testElem.innerHTML = label.toFixed(2);
    }


    let y2 = 1. * priceDivHeight * squishTop;
    let y1 = priceDivHeight - bottomPad;

    slope = 1. * (y2 - y1) / (maxPrice - minPrice);
    intercept = y1 - (slope * minPrice);

    // note these are new (rescaled) local vars, not class vars
    for (let i = 0; i < clPlt.length; i++) {
        opPlt[i] = priceToPixel(opPlt[i]);
        hiPlt[i] = priceToPixel(hiPlt[i]);
        loPlt[i] = priceToPixel(loPlt[i]);
        clPlt[i] = priceToPixel(clPlt[i]);
        priceSMA50plt[i] = priceToPixel(priceSMA50plt[i]);
        priceSMA200plt[i] = priceToPixel(priceSMA200plt[i]);
    }


    // RESCALE MARKET PRICES
    let min_mkt = arrayMin(SP500clPlt);
    let max_mkt = arrayMax(SP500clPlt);
    y2 = 5.0; // buffer from top of div element (pixels);
    y1 = priceDivHeight * 1.5 * squishTop;
    let mkt_slope = 1. * (y2 - y1) / (max_mkt - min_mkt);
    let mkt_intercept = y1 - (mkt_slope * min_mkt);
    for (let i = 0; i < SP500clPlt.length; i++) {
        SP500clPlt[i] = round(1. * SP500clPlt[i] * mkt_slope + mkt_intercept, 2);
    }


    // RESCALE VOLUME, USE SQUARE ROOT TO REDUCE PEAKS
    // map (mean + _ standard deviations) onto the max of the <div> height
    const numStdevs = 4.0;
    let [volMean, volStdev] = mean_stdev(volPlt);
    for (let i = 0; i < volPlt.length; i++) {
        volPlt[i] = volDivHeight - volDivHeight * volPlt[i] / (volMean + numStdevs * volStdev);
        volSMA50plt[i] = volDivHeight - volDivHeight * volSMA50plt[i] / (volMean + numStdevs * volStdev);
    }


    // GENERATE PATHS
    let path_up = "";
    let path_down = "";
    let vol_path_up = "";
    let vol_path_down = "";
    let num_days_hist = clPlt.length;
    let rightmost_bar_horiz = priceDivWidth - rightPad;
    let num_to_draw = Math.ceil(Math.min(screenCapacity, num_days_hist));
    let mkt_path = "M" + rightmost_bar_horiz.toString() + " " + SP500clPlt[0].toString();
    let p_sma_50_path = "M" + rightmost_bar_horiz.toString() + " " + priceSMA50plt[0].toString();
    let p_sma_200_path = "M" + rightmost_bar_horiz.toString() + " " + priceSMA200plt[0].toString();
    let v_sma_50_path = "M" + rightmost_bar_horiz.toString() + " " + volSMA50plt[0].toString();

    for (let i = 0; i < num_to_draw; i++) {
        x_ctr = rightmost_bar_horiz - i * priceHorizSpacing;

        // note that due to pixel space going in opposite dir as price space we need to use unintuitive comparisons
        // i = 0 is the most recent bar
        if (i < num_days_hist - 1) {
            if (clPlt[i] <= clPlt[i + 1]) {
                path_up += ("M" + x_ctr.toString() + " " + loPlt[i].toString() +
                        " L" + x_ctr.toString() + " " + hiPlt[i].toString() +
                        " M" + (x_ctr + priceHorizSpacing / 2).toString() + " " + clPlt[i].toString() +
                        " L" + (x_ctr - priceHorizSpacing / 2).toString() + " " + clPlt[i].toString() + " ");

                vol_path_up += ("M" + x_ctr.toString() + " " + volDivHeight.toString() +
                        " L" + x_ctr.toString() + " " + volPlt[i].toString() + " ");

            } else {
                path_down += ("M" + x_ctr.toString() + " " + loPlt[i].toString() +
                        " L" + x_ctr.toString() + " " + hiPlt[i].toString() +
                        " M" + (x_ctr + priceHorizSpacing / 2).toString() + " " + clPlt[i].toString() +
                        " L" + (x_ctr - priceHorizSpacing / 2).toString() + " " + clPlt[i].toString() + " ");

                vol_path_down += ("M" + x_ctr.toString() + " " + volDivHeight.toString() +
                        " L" + x_ctr.toString() + " " + volPlt[i].toString() + " ");
            }

            // at oldest bar, select color by comparing open and close on that same day
        } else {
            if (clPlt[i] <= opPlt[i]) {
                path_up += ("M" + x_ctr.toString() + " " + loPlt[i].toString() +
                        " L" + x_ctr.toString() + " " + hiPlt[i].toString() +
                        " M" + (x_ctr + priceHorizSpacing / 2).toString() + " " + clPlt[i].toString() +
                        " L" + (x_ctr - priceHorizSpacing / 2).toString() + " " + clPlt[i].toString() + " ");

                vol_path_up += ("M" + x_ctr.toString() + " " + volDivHeight.toString() +
                        " L" + x_ctr.toString() + " " + volPlt[i].toString() + " ");

            } else {
                path_down += ("M" + x_ctr.toString() + " " + loPlt[i].toString() +
                        " L" + x_ctr.toString() + " " + hiPlt[i].toString() +
                        " M" + (x_ctr + priceHorizSpacing / 2).toString() + " " + clPlt[i].toString() +
                        " L" + (x_ctr - priceHorizSpacing / 2).toString() + " " + clPlt[i].toString() + " ");

                vol_path_down += ("M" + x_ctr.toString() + " " + volDivHeight.toString() +
                        " L" + x_ctr.toString() + " " + volPlt[i].toString() + " ");
            }
        }


        mkt_path += (" L" + x_ctr.toString() + " " + SP500clPlt[i].toString());
        p_sma_50_path += (" L" + x_ctr.toString() + " " + priceSMA50plt[i].toString());
        p_sma_200_path += (" L" + x_ctr.toString() + " " + priceSMA200plt[i].toString());
        v_sma_50_path += (" L" + x_ctr.toString() + " " + volSMA50plt[i].toString());
    }

    document.getElementById('prPathUp').setAttribute('d', path_up);
    document.getElementById('prPathDn').setAttribute('d', path_down);
    document.getElementById('mktPath').setAttribute('d', mkt_path);
    document.getElementById('volPathUp').setAttribute('d', vol_path_up);
    document.getElementById('volPathDn').setAttribute('d', vol_path_down);
    document.getElementById('prSMAfifty').setAttribute('d', p_sma_50_path);
    document.getElementById('prSMAtwoHundred').setAttribute('d', p_sma_200_path);
    document.getElementById('volSMAfifty').setAttribute('d', v_sma_50_path);

    // re-scale and reposition the PL rectangles
    if (chartPLs.length > 0) {
        updatePLrects();
    }
}

function drawGridlines() {
    clearPriceGLineLabels();
    priceGLineLabels = [];
    let minor_path = "";
    let vol_minor_path = "";
    let minor_spacing_v = 25; //  vertical spacing btw horiz gridlines
    let minor_spacing_h = 20;
    let num_minor_gridlines_h = Math.ceil(priceDivHeight / minor_spacing_v);
    let num_minor_gridlines_v = Math.ceil(priceDivWidth / minor_spacing_h);
    let num_minor_vol_gridlines_v = Math.floor(volDivHeight / minor_spacing_v);
    // num_minor_gridlines_h = int((price_div_width - right_pad) / minor_spacing_h) //  uses padding
    // num_major_gridlines = int(num_minor_gridlines_v / 4) - 1 //  maybe in the future add major gridlines?

    //  horiz dashed gridlines
    for (let i = 0; i <= num_minor_gridlines_h; i++) {
        let vert_pos = priceDivHeight - i * minor_spacing_v;
        let horiz_lim = priceDivWidth - rightPad + 20;
        minor_path += ("M0 " + vert_pos.toString() + " L" + horiz_lim.toString() + " " + vert_pos.toString() + " ");

        // CREATE PRICE LABELS FOR EVERY 5TH GRIDLINE
        if ((i-1) % labeledPriceGLineInterval === 0 && vert_pos > 20) {
            generatePriceGLineLabel(horiz_lim + 3, vert_pos + 5);
        }
    }

    //  vert dashed gridlines
    for (let i = 4; i <= num_minor_gridlines_v; i++) {
        let horiz_pos = priceDivWidth - i * minor_spacing_h;
        // horiz_pos = price_div_width - right_pad - i * minor_spacing_h;
        minor_path += ("M" + horiz_pos.toString() + " 0 L" + horiz_pos.toString() + " " + priceDivHeight.toString() + " ");
        vol_minor_path += ("M" + horiz_pos.toString() + " 0 L" + horiz_pos.toString() + " " + volDivHeight.toString() + " ");
    }

    //  horiz dashed gridlines in Volume div element
    for (let i = 0; i <= num_minor_vol_gridlines_v; i++) {
        let vert_pos = volDivHeight - i * minor_spacing_v;
        let horiz_lim = volDivWidth - rightPad + 20;;
        // horiz_lim = vol_div_width - right_pad;
        vol_minor_path += ("M0 " + vert_pos.toString() + " L" + horiz_lim.toString() + " " + vert_pos.toString() + " ");
    }

    document.getElementById('minorGrid').setAttribute('d', minor_path);
    document.getElementById('minorGridVol').setAttribute('d', vol_minor_path);
}

function goLong() {
    inLongPosition = true;
    btnBuy.innerHTML = "Sell";
    btnShort.disabled = true;
    btnShort.style.backgroundColor = buttonFadedColor;
    btnNextChart.disabled = true;
    btnNextChart.style.backgroundColor = buttonFadedColor;

    positionBars.unshift([currentBar - 1, null]); // prepend
    chartPLs.unshift(1.0);
    adv1();
}

function sellHoldings() {
    positionBars[0][1] = currentBar - 1; // record the closing bar
    chartPLs[0] = op[currentBar - 1] / op[positionBars[0][0]];

    // create PL rectangle. The position of this function call is important,
    // the script-scoped chartPLs and positionBars variables MUST be up to date
    generatePLrect();

    // finish calcs first (above) then make buttons available again
    inLongPosition = false;
    btnBuy.innerHTML = "Buy";
    btnShort.disabled = false;
    btnShort.style.backgroundColor = buttonDefaultColor;
    btnNextChart.disabled = false;
    btnNextChart.style.backgroundColor = buttonDefaultColor;
}

btnBuy.onclick = function () {
    buyOrSell();
};
function buyOrSell() {
    if (inLongPosition === false) {
        goLong();
    } else {
        sellHoldings();
    }
}

function goShort() {
    inShortPosition = true;
    btnShort.innerHTML = "Cover";
    btnBuy.disabled = true;
    btnBuy.style.backgroundColor = buttonFadedColor;
    btnNextChart.disabled = true;
    btnNextChart.style.backgroundColor = buttonFadedColor;

    positionBars.unshift([currentBar - 1, null]); // prepend
    chartPLs.unshift(1.0);
    adv1();
}

function coverShort() {
    positionBars[0][1] = currentBar - 1;
    chartPLs[0] = Math.max(0, 2 - op[currentBar - 1] / op[positionBars[0][0]]);

    // create PL rectangle. The position of this function call is important,
    // the script-scoped chartPLs and positionBars variables MUST be up to date
    generatePLrect();

    // finish calcs first (above) then make buttons available again
    inShortPosition = false;
    btnShort.innerHTML = "Short";
    btnBuy.disabled = false;
    btnBuy.style.backgroundColor = buttonDefaultColor;
    btnNextChart.disabled = false;
    btnNextChart.style.backgroundColor = buttonDefaultColor;
}

btnShort.onclick = function () {
    shortOrCover();
};
function shortOrCover() {
    if (inShortPosition === false) {
        goShort();
    } else {
        coverShort();
    }
}

btnAdv1.onclick = function () {
    adv1();
};

function adv1() {
    if (currentBar === 1) {
        // close any open position
        if (inLongPosition) {
            sellHoldings();
        } else if (inShortPosition) {
            coverShort();
        }
        btnBuy.disabled = true;
        btnBuy.style.backgroundColor = buttonFadedColor;
        btnShort.disabled = true;
        btnShort.style.backgroundColor = buttonFadedColor;
        btnAdv1.disabled = true;
        btnAdv1.style.backgroundColor = buttonFadedColor;
        btnAdv5.disabled = true;
        btnAdv5.style.backgroundColor = buttonFadedColor;
        let exitDate = new Date(dates[0]);
        document.getElementById("symbolInfoSym").innerHTML = sym;
        document.getElementById("symbolInfoDate").innerHTML = (1 + exitDate.getUTCMonth()).toString() +
                '/' + exitDate.getUTCDate().toString() + '/' + exitDate.getUTCFullYear().toString();
        readyToAdvance = true;
    }

    currentBar = Math.max(0, currentBar - 1);
    drawChart();

}

btnAdv5.onclick = function () {
    adv5();
};
function adv5() {
    currentBar = Math.max(1, currentBar - 5);
    if (currentBar === 1) {
        adv1();
    } else {
        drawChart();
    }
}

function setCookie(cname, cvalue, exdays) {
    if (!isNaN(cvalue)) {
        let d = new Date();
        d.setTime(d.getTime() + (exdays*24*60*60*1000));
        let expires = "expires="+ d.toUTCString();
        document.cookie = cname + "=" + cvalue.toString() + ";" + expires;
    }
}

function findIndexOfDate(date) {
  return date === dates[currentBar];
}
