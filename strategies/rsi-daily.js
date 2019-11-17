// helpers
var _ = require('lodash');
var log = require('../core/log.js');
var RSI = require('./indicators/RSI.js');

// Set Risk And reward
var MinProf = 0.3;
var MaxLoss = 0.03;
var DayMax = 0.15;
var Retry = 3;

// let's create our own method
var method = {};

// prepare everything our method needs
method.init = function () {

  // define the indicators we need
  this.addIndicator('rsi', 'RSI', this.settings);
  this.requiredHistory = this.tradingAdvisor.historySize;

  // set price details
  this.positionOpen = false;
  this.sellSignal = false;
  this.openPrice = 0;
  this.currentClose = 0;

  // set trade properties
  this.trade = {
    duration: 0,
    wrong: 0,
    betterSell: 0
  };

  // set RSI values
  this.rsis = {
    RSI1: 0,
    RSI2: 0,
    RSI3: 0,
    FRSI: 0
  };
}

// log the last calculated parameters
method.log = function (candle) {
  var digits = 2;
  var rsi = this.indicators.rsi;
  this.currentClose = candle.close.toFixed(digits);
  log.debug('calculated RSI properties for candle:');
  log.debug('\t', 'rsi:', rsi.result.toFixed(digits));
  log.debug('\t', 'price:', candle.close.toFixed(digits));
}

// the bot starts looking at trades from here.
method.check = function () {
  var rsiCurrent = this.indicators.rsi.result;

  // is there a postion open?
  if (this.positionOpen == true) {

    // calculate Stops
    this.ProfStop = ((this.openPrice) + (this.openPrice * MinProf));
    this.TakeLoss = ((this.openPrice) - (this.openPrice * MaxLoss));
    this.DayProf = ((this.openPrice) + (this.openPrice * DayMax));

    // set 1hr timeframes
    this.FirstCheck = 1;
    this.SecondCheck = 3;
    this.Day = 24;
    this.DayTwo = 48;
    this.WeekHalf = 95;
    this.Week = 168;

    if ((this.trade.duration == this.FirstCheck) && (this.currentClose < this.openPrice)) {

      // has the bot retried 3 times yet?
      if (this.trade.wrong == Retry) {
        this.positionOpen = false;
        this.trade.duration = 0;
        this.trade.wrong = 0;
        log.debug('Giving up on the entry, price keeps falling');
        this.advice('short');

        // a lower price is available,
        // close long and re-enter.
      } else {
        this.positionOpen = false;
        this.trade.duration = 1.0;
        this.advice('short');
        this.positionOpen = true;
        log.debug('Better entry has been found, entering here');
        this.advice('long');
        this.openPrice = this.currentClose;
        this.trade.wrong++
      }

      // close the trade and re-enter at current price,
      // if price has gone lower 3hrs after entry
    } else if ((this.trade.duration == this.SecondCheck) && (this.currentClose < this.openPrice)) {
      this.positionOpen = false;
      this.trade.duration = 1.0;
      this.advice('short');
      this.positionOpen = true;
      log.debug('A better price has been found after ', this.trade.duration, 'hours');
      this.openPrice = this.currentClose;
      this.advice('long');
      this.trade.wrong++

      // take profit
      // if price is up 30% in after 24hrs
    } else if ((this.trade.duration == this.Day) && (this.currentClose > this.DayProf)) {
      this.positionOpen = false;
      this.trade.duration = 0;
      this.trade.wrong = 0;
      log.debug('Closing because price is up more than 30% in ', this.trade.duration, 'hours');
      this.advice('short');

      // take the loss
      // if price is lower than entry between 1-3 days
    } else if ((this.trade.duration >= this.WeekHalf) && (this.currentClose >= this.TakeLoss) && (this.currentClose < this.openPrice)) {
      this.positionOpen = false;
      this.trade.duration = 0;
      this.trade.wrong = 0;
      log.debug('Closing because price is lower than entry after, ', this.trade.duration, 'hours');
      this.advice('short');

      // close the trade between 4-7 days
      // if RSI has not gone above 50
      // and price is above stop loss
    } else if ((this.trade.duration >= this.WeekHalf) && (this.trade.duration <= this.Week) && (rsiCurrent < this.settings.thresholds.low) && (this.currentClose > this.TakeLoss)) {
      this.positionOpen = false;
      this.trade.duration = 0;
      this.trade.wrong = 0;
      log.debug('Closing because price is lower than entry after, ', this.trade.duration, 'hours');
      this.advice('short');

      // take the profit
      // if RSI shows heavy overbought conditions
      // and price is above entry
    } else if ((rsiCurrent >= this.settings.thresholds.high) && (this.currentClose > this.openPrice)) {
      this.positionOpen = false;
      this.trade.duration = 0;
      this.trade.wrong = 0;
      log.debug('Closing because price is higher than open and RSI is above 85');
      this.advice('short');

      // take the profit
      // if current close is 30% higher than entry
      // and RSI is higher than 85
    } else if ((this.currentClose >= this.ProfStop) && (rsiCurrent >= this.settings.thresholds.high)) {
      this.positionOpen = false;
      this.trade.duration = 0;
      this.trade.wrong = 0;
      log.debug('Closing because profit is higher than 30% and RSI is above 85');
      this.advice('short');

      // no sell triggers detected
      // add 1 to trade duration
    } else {
      this.trade.duration++;
      this.advice();
    }

    // check if FRSI has been set yet
    // if FRSI is 0 then bot has not found a trade yet.
  } else if (this.rsis.FRSI == 0) {

    // set FRSI
    // if RSI ends below 40
    if (rsiCurrent < this.settings.thresholds.low) {
      this.rsis.FRSI = rsiCurrent;
      this.advice();

      // keep waiting
      // do nothing
    } else {
      this.advice();
    }

    // FRSI has been set
    // check if RSI ends higher than FRSI
    // and RSI is lower than 40
  } else if ((rsiCurrent > this.rsis.FRSI) && (rsiCurrent < this.settings.thresholds.low)) {

    // check if RSI2 has been found
    // set RSI1 to the prevouis close (FRSI)
    // set RSI2 to current RSI
    if (this.rsis.RSI2 == 0) {
      this.rsis.RSI1 = this.rsis.FRSI;
      this.rsis.RSI2 = rsiCurrent;
      this.advice();

      // enter the long
      // if RSI makes a higher low below 40
    } else if ((rsiCurrent < this.rsis.RSI2) && (rsiCurrent >= this.rsis.RSI1)) {
      this.rsis.RSI3 = rsiCurrent;
      this.positionOpen = true;
      this.openPrice = this.currentClose;
      this.trade.duration = 1;
      log.debug('RSI has made a higher low below 40');
      this.advice('long');
      this.rsis.FRSI = 0;

      // RSI ended higher than FRSI
      // and RSI is lower than 40
      // but ended higher than RSI2
    } else {
      this.rsis.FRSI = 0;
      this.advice();
    }

    // RSI is going lower
    // set FRSI1 to lowet possible
  } else {
    this.rsis.FRSI = rsiCurrent;
    this.advice();
  }
}

module.exports = method;
