var Discord = require('discord.js');
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
const PORT = process.env.PORT || 3001;



var MongoClient = require('mongodb').MongoClient;

const MONGOPORT = process.env.MONGOPORT || 27017
const MONGO_URL = "mongodb://localhost:" + MONGOPORT + "/main";
var classesDB  
var usersDB                 //classes database

var app = express();


const SEATCHANGE = 6
const percentageForPanic = .3;



// Configure logger settings
logger.remove(logger.transports.Console);
logger.add(new logger.transports.Console, {
    colorize: true
});


logger.level = 'debug';
// Initialize Discord Bot
var bot = new Discord.Client();
bot.login(auth.token);

bot.on('ready', function (evt) {
    
    logger.info('Connected');
   
    MongoClient.connect(MONGO_URL, function (err, client) {
        
        if (err) {
            throw err;
        }
        db = mongoDBDatabase = client.db('main');
        classesDB = db.collection('classes');
        usersDB = db.collection('users')
    
        app.listen(PORT, function () {
            console.log("listening for mongo on port " + PORT); //don't start listening until connected.
        })
        updateAllClassSeats();
    })
});

bot.on('message', message=> {
    message.content
    // Our bot needs to know if it will execute a command
    // It will listen for messages that will start with `!`
    if (message.content.substring(0, 1) == '#') {
        var args = message.content.substring(1).split(' ');
        var cmd = args[0];
        
        args = args.splice(1);
        cmd = cmd.toLowerCase();
        switch(cmd) {
            // #ping

            case 'getSeats':
            case 'getseats':
            case 'GetSeats':
            case 'Getseats':
          
               
                attemptToGetSeats(args,message) 
                break;
            case 'listen':
            case 'Listen':
            case 'LISTEN':
                listenForCLass(message,args)
                
                break;
            default:
                console.log("unknown command")
            // Just add any case commands if you want to..
         }
     }
});




function updateAllClassSeats(){
    var classesCursor = classesDB.find()
   classesCursor.toArray(function(err,classes){
       for(var i = 0; i < classes.length; i++){
            updateClass(classes[i].CRN)
       }
    });
}

function updateClass(crn){
    (async () => {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        const url = "https://classes.oregonstate.edu/?keyword="+crn+"&srcdb=999999"
        await page.goto(url);
        await page.waitForSelector('.panel__body') //when this loads I know that the classes are loaded.

        await page.waitForSelector(".panel__info-bar-text")
        var amountOfClasses = await page.evaluate(()=> document.querySelector(".panel__info-bar-text").textContent); 
        
        var className = await page.evaluate(()=>document.querySelector(".result__code").textContent);
        var classFullDescription = await page.evaluate(()=> document.querySelector(".result__title").textContent); 
    
        const element = await page.waitForSelector('.result');
        
        await element.click()
        
        await page.waitForSelector(".detail-ssbsect_seats_avail");
        
        const result = await page.evaluate(()=> document.querySelector('.detail-ssbsect_seats_avail').textContent); 
        
        let splitResult = result.split(':')
    
        let fixedResult = Number(splitResult[1].substr(1))
        var spacesLeft = fixedResult;

        var totalNumberOfSeats = await page.evaluate(()=>document.querySelector(".detail-max_enroll").textContent);
        totalNumberOfSeats = totalNumberOfSeats.split(":")
        totalNumberOfSeats = totalNumberOfSeats[1]
        totalNumberOfSeats = Number(totalNumberOfSeats.substr(1))
    

    

        var d = new Date();

            
        
               
        classesDB.updateOne({"CRN":crn},{
            $set: {
            "seatsLeft":spacesLeft,
            "timeUpdated":d.getTime(),
            "totalSeats":totalNumberOfSeats
        }})

        var currentClass = classesDB.find({ "CRN": crn });
        currentClass.toArray(function(err,thisClass){
            
            var lastSeatsLeft = Number(thisClass[0].lastUpdatedAt);
            
            
            if(lastSeatsLeft-spacesLeft >= SEATCHANGE || (spacesLeft != lastSeatsLeft && spacesLeft < percentageForPanic * thisClass[0].totalSeats)){
                
                classesDB.updateOne({"CRN":crn},{
                    $set: {
                    "seatsLeft":spacesLeft,
                    "timeUpdated":d.getTime(),
                    "totalSeats":totalNumberOfSeats,
                    "lastUpdatedAt":spacesLeft
                }})
                updateUsersOnClass(crn)

            }else{
                console.log("don't need to message users about class: ",crn);
                classesDB.updateOne({"CRN":crn},{
                    $set: {
                    "seatsLeft":spacesLeft,
                    "timeUpdated":d.getTime(),
                    "totalSeats":totalNumberOfSeats
                }})
            }
            
            
            

        })
        

        
                  
        await browser.close();
        
        
    })();
}



function updateUsersOnClass(crn){
    console.log("updating users on class: ",crn)
    var userCursor = usersDB.find()
    userCursor.toArray(function(err,users){
        for(var i = 0; i < users.length; i++){
            for(var j = 0; j < users[i].crns.length; j++){
                if(users[i].crns[j] == crn){
                    updateUserOnClass(users[i].userID,crn)
                }
            }
        }


    })
}
function updateUserOnClass(userID,crn){
 
    bot.users.fetch(userID).then(function(actualUser){
        var classCursor = classesDB.find({"CRN":crn});
        classCursor.toArray(function(err,resultingClass){
            var currentClass = resultingClass[0];
            actualUser.send("Hi! Just wanted to update you that CRN:" + currentClass.CRN + ", " + currentClass.classCode + ", " + currentClass.className + " currently has " + currentClass.seatsLeft + "/" + currentClass.totalSeats + " seats left.")
            
        })







    },function(err){
        console.log(err);
    })   


}


function listenForCLass(message,args){
    if(testArgs(args)){
        attemptToAddClassToDB(message,args[0])

    }else{
        message.channel.send("<@"+message.author.id+"> "+"Incorrect usage! Please do #getSeats {crn} where crn is an OSU class code with 5 digits. Example: #getSeats 12345") 
        xMessage(message)
    }

}


function attemptToAddClassToDB(message,crn){
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
            message.channel.send("<@"+message.author.id+"> The CRN: " + crn + " did not return only one class. Please make sure that your CRN"+
            " is correct, by confirming on the classes.oregonstate.edu page.")
            xMessage(message)
            
        }else{
    
            var className = await page.evaluate(()=>document.querySelector(".result__code").textContent);
            var classFullDescription = await page.evaluate(()=> document.querySelector(".result__title").textContent); 
      
            const element = await page.waitForSelector('.result');
            
            await element.click()
            
            await page.waitForSelector(".detail-ssbsect_seats_avail");
            
            const result = await page.evaluate(()=> document.querySelector('.detail-ssbsect_seats_avail').textContent); 
            
            let splitResult = result.split(':')
        
            let fixedResult = Number(splitResult[1].substr(1))
            spacesLeft = fixedResult;

            var totalNumberOfSeats = await page.evaluate(()=>document.querySelector(".detail-max_enroll").textContent);
            totalNumberOfSeats = totalNumberOfSeats.split(":")
            totalNumberOfSeats = totalNumberOfSeats[1]
            totalNumberOfSeats = Number(totalNumberOfSeats.substr(1))
        

            classCursor= classesDB.find({"CRN":crn})

            var d = new Date();

            userCursor = usersDB.find({"userID":message.author.id})

            userCursor.toArray(function(err,users){
               
                if(users.length != 0){
                    
                    var currentUserCRNs = users[0].crns;
                    if(currentUserCRNs.includes(crn)){
                        message.channel.send("<@"+message.author.id+"> You already are listening for this CRN!")
                        xMessage(message)
                    }else{
                        var currentUserCRNs = users[0].crns;
                  
                        currentUserCRNs.push(crn)
                        usersDB.updateOne({"userID":message.author.id},
                            {$set:{
                                "crns":currentUserCRNs
                            }}
                        )
                        message.channel.send("<@"+message.author.id+"> You are now listening for " + className + ", " + classFullDescription + ", CRN:" + crn + ". It currently has " + spacesLeft + "/" + totalNumberOfSeats+" seats left.")
                        checkmarkMessage(message)
                    }
                  
                }else{
                    
                    newCRNList = [crn]
                    usersDB.insertOne({
                        "userID":message.author.id,
                        "userName":message.author.username,
                        "userDateCreated":d.getFullYear() + "/" + d.getMonth() + "/" + d.getDate(),
                        "crns":newCRNList
                    })
                    message.channel.send("<@"+message.author.id+"> You are now listening for " + className + ", " + classFullDescription + ", CRN:" + crn + ". It currently has " + spacesLeft + "/" + totalNumberOfSeats+" seats left.")
                    checkmarkMessage(message)
                }

            })

            classCursor.toArray(function(err,classes){
                if(classes.length==0){
                   
                    classesDB.insertOne({
                        "CRN":crn,
                        "timeUpdated":d.getTime(),
                        "classCode":className,
                        "className":classFullDescription,
                        "seatsLeft":spacesLeft,
                        "lastUpdatedAt":spacesLeft,
                        "totalSeats":totalNumberOfSeats
                    })
                }
            })
        }
        await browser.close();
        
        
    })();
}


function checkmarkMessage(message){
    message.react('✅')
}
function xMessage(message){
    message.react('❌')
}



function testArgs(args){
    if(args.length != 1){
        return false
    }
    crn = Number (args[0])
    if(crn == NaN || args[0].length != 5){
        return false
    }
    return true
}



function attemptToGetSeats(args, message){

    if(testArgs(args)){
        printSeatsLeftInCRN(crn,message)
    }else{
        message.channel.send("<@"+message.author.id+"> "+"Incorrect usage! Please do #getSeats {crn} where crn is an OSU class code with 5 digits. Example: #getSeats 12345")
        xMessage(message)
         
    }
}



//assumes you're using gmail. Might need to change some stuff in nodemailer if you aren't.

let lastEmailSentAt;

let firstTime = true;

let spacesLeft;


function printSeatsLeftInCRN(crn,message){
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
            message.channel.send("<@"+message.author.id+"> The CRN: " + crn + " did not return only one class. Please make sure that your CRN"+
            " is correct, by confirming on the classes.oregonstate.edu page.")
            xMessage(message)
        }else{
    
            var className = await page.evaluate(()=>document.querySelector(".result__code").textContent);
            var classFullDescription = await page.evaluate(()=> document.querySelector(".result__title").textContent); 
       

            const element = await page.waitForSelector('.result');
            
            await element.click()
            
            await page.waitForSelector(".detail-ssbsect_seats_avail");
            
            const result = await page.evaluate(()=> document.querySelector('.detail-ssbsect_seats_avail').textContent);  
    
            let splitResult = result.split(':')
        
            let fixedResult = Number(splitResult[1].substr(1))
            spacesLeft = fixedResult;

            var totalNumberOfSeats = await page.evaluate(()=>document.querySelector(".detail-max_enroll").textContent);
            totalNumberOfSeats = totalNumberOfSeats.split(":")
            totalNumberOfSeats = totalNumberOfSeats[1]
            totalNumberOfSeats = Number(totalNumberOfSeats.substr(1))

            message.channel.send("<@"+message.author.id+"> " + className + ", " + classFullDescription + ", CRN: "+crn + " has " +spacesLeft+ "/" + totalNumberOfSeats+ " seats left.")
            checkmarkMessage(message)

        }
        await browser.close();
        
        
    })();
   

}




