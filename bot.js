var Discord = require('discord.io');
var logger = require('winston');
var auth = require('./auth.json');
var axios = require('axios')
var fs = require('fs');

var exphbs = require("express-handlebars");
var bodyParser = require('body-parser');
var express = require('express')

var nodemailer = require('nodemailer')
const puppeteer = require('puppeteer');
const {
    CONNREFUSED
} = require('dns');
const {
    Console
} = require('console');

const e = require('express');
const PORT = process.env.PORT || 3000;



// Configure logger settings
logger.remove(logger.transports.Console);
logger.add(new logger.transports.Console, {
    colorize: true
});


logger.level = 'debug';
// Initialize Discord Bot
var bot = new Discord.Client({
   token: auth.token,
   autorun: true
   
});

bot.on('ready', function (evt) {
    
    logger.info('Connected');
    logger.info('Logged in as: ');
    logger.info(bot.username + ' - (' + bot.id + ')');
});
bot.on('message', function (user, userID, channelID, message, evt) {
    // Our bot needs to know if it will execute a command
    // It will listen for messages that will start with `!`
    if (message.substring(0, 1) == '#') {
        var args = message.substring(1).split(' ');
        var cmd = args[0];
       
        args = args.splice(1);
        switch(cmd) {
            // #ping
            case 'getSeats':
            case 'getseats':
            case 'GetSeats':
            case 'Getseats':
                attemptToGetSeats(args,channelID,userID) 
                
            break;
            // Just add any case commands if you want to..
         }
     }
});

function attemptToGetSeats(args, channelID,userID){
    if(args.length != 1){
        bot.sendMessage({
            to: channelID,
            message: "Incorrect usage! Please do #getSeats {crn} . Example: #getSeats 12345"
        });
    }else{
        crn = Number(args[0])
        if(crn==NaN || args[0].length != 5){
            bot.sendMessage({
                to: channelID,
                message: "Incorrect usage! Please do #getSeats {crn} . Example: #getSeats 12345"
            }); 
        }else{
            printSeatsLeftInCRN(crn,channelID, userID)
            
        }
    }
}

var app = express();


app.set('view engine', 'handlebars');
app.use(express.static('public'));
app.use(bodyParser.json({
    limit: '50mb'
}));

app.listen(PORT, function () {
    console.log("listening on port " + PORT); //don't start listening until connected.
})

//assumes you're using gmail. Might need to change some stuff in nodemailer if you aren't.

let lastEmailSentAt;

let firstTime = true;

let spacesLeft;


function printSeatsLeftInCRN(crn,channelID,userID){
    (async () => {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        const url = "https://classes.oregonstate.edu/?keyword="+crn+"&srcdb=999999"
        await page.goto(url);
        await page.waitForSelector('.panel__body') //when this loads I know that the classes are loaded.

        await page.waitForSelector(".panel__info-bar-text")
        var amountOfClasses = await page.evaluate(()=> document.querySelector(".panel__info-bar-text").textContent); 
        
        amountOfClasses = amountOfClasses.split(" ")
        amountOfClasses = Number(amountOfClasses[1])
        if(amountOfClasses != 1){
            bot.sendMessage({
                to: channelID,
                message: "<@"+userID+"> The CRN: " + crn + " returned more than one class. Please make sure that your CRN"+
                " is correct, by confirming on the classes.oregonstate.edu page."
            });
        }else{
    
            var className = await page.evaluate(()=>document.querySelector(".result__code").textContent);
            var classFullDescription = await page.evaluate(()=> document.querySelector(".result__title").textContent); 
            console.log(className)
            console.log(classFullDescription)


            const element = await page.waitForSelector('.result');
            
            await element.click()
            
            await page.waitForSelector(".detail-ssbsect_seats_avail");
            
            const result = await page.evaluate(()=> document.querySelector('.detail-ssbsect_seats_avail').textContent);  
    
            let splitResult = result.split(':')
        
            let fixedResult = Number(splitResult[1].substr(1))
            spacesLeft = fixedResult;
            bot.sendMessage({
                to: channelID,
                message: "<@"+userID+"> " + className + ", " + classFullDescription + ", CRN: "+crn + " has " +spacesLeft+ " seats left."
            });
        }
        await browser.close();
        
        
    })();
   

}




