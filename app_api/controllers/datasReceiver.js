const mongoose = require('mongoose');
//var moment = require('moment-timezone');
//var storedDatasModel = mongoose.model('StoredData');
//var sensorGroupModel = mongoose.model('SensorGroup'); Old version
//New version to use statics method : 
// link : https://stackoverflow.com/questions/59642997/unable-to-call-mongoose-static-method-error-findbycredential-is-not-a-function 
// and official mongooose docs

// Official documentation for Node HTTP : https://nodejs.org/en/docs/guides/anatomy-of-an-http-transaction/
// Official express documentation https://expressjs.com/en/4x/api.html#express

const {sensorGroup} = require('../models/sensorGroup') // récupère le Model crée 
const {storedDatas} = require('../models/storedDatas')

var sendJsonResponse ;
//var splitReceivedText; 

sendJsonResponse = function(res, status, content) {
    res.status(status);
    res.json(content);
};
// Réception d'un http post de l'arduino ici, créer les "stored datas" associées en base 

//1) HTTP POST reçu au format "plain text" et avec le format UNIXEPOCH VALUE (Unixepoch en secondes) , id du sensor en paramètre de la requête (URL) [une version d'envoi au format JSON était premuèrement implémentée]
//2) Main function récupère : EPOCH, SENSORID, VALUE et DATATYPE
//3) Selon le datatype, on sait quel format est attendu pour value, appelle de la fonction pour store selon le type
//4) Stockage des données; envoi directement avec l'EPOCH, Mongoose formatte au format UTC et on garde l'information pour la timezone dans le document du sensorgroup
//5) Réponse à l'arduino : erreur, besoin d'un renvoi ? alerte quelconque ... en JSON

/**************************************************************/
/*           MAIN FUNCTION - receiving data packets           */
/**************************************************************/
/****************************/
/*   GROUP SETUP METHODS    */
/****************************/
/**** HTTP POST PROCESS DATAS  *****/
/**
* Process datas sent via HTTP Post by Arduino
* @todo
*/
module.exports.postProcess =  async function postProcess (req,res) {
    var dataType;
    var timezone;
    var epoch; 
    var date; 
    // use http.createServer ? Non car implémenté similairement par midleware express et dans les routes déjà 
    // Stored data sont stocké comme ça directement : (fields : date, sensorId, value) 
    // But : retrouvé l'ID du sensorId passé pour savoir quel type de donnée on reçoit et qu'il est effectivement bon 
    if (!req.params.sensorid) {
         // sensorid pas dans la requete post
        sendJsonResponse(res,404, {
            "message": "Parameter sensorId missing in post request"
        });
    }
    else {
        // req.body has to be "EPOCH VALUE", epoch in seconds
        // todo add verification? 
        var postText = req.body; //NOW : OLD : 20/4/20 16:08:16 15.15 (arduino envoi ça )
        var sensorId = req.params.sensorid ; 
        // 30/04 new version, get datatype with sensorId
        var groupIdDataType = sensorId.split("-"); 
        var dataType = groupIdDataType[1]; 
       // argument en second , réponse en milisecond
       //com1
        epoch = getEpochFromPostText(postText);
        // possible de récupérer la date avec momentJS au format de la timezone : date = moment.tz(epoch,timezone).format(); 
        // finalement pas utilisé pour le moment on store directement avec l'epoch time
        // get value
        value = getValueFromPostText(postText);
        
       // selon datatype, traité différement (value type différent) todo 
        switch(dataType) {
            case 'temp': // value est donc un int   
                //console.log(utcDate instanceof Date && !isNaN(date.valueOf()));
                try { 
                    // date au format isodate ou epoch peuvent être passé 
                    // enregistrer similairement par .save()
                    // Impossible de conserver d'information locale dans Mongo
                    // format UTC avec zero décalage quoi qu'il arrive (car store comme un int64)
                    // gérer la timezone au moment de récupérer les données
                    let status = await storedDatas.registerIntData(epoch,sensorId,Number(value));
                    if (status !== 201) {
                        throw new Error("error inserting datas");
                    }
                    else {
                        sendJsonResponse(res,status,{
                            "message": "datas stored"
                        });
                    }
                }
                catch(err) {
                    // todo something with error handle here ou dans la methode storedData 1588267200
                    console.log(err); 
                    sendJsonResponse(res,500,{
                        "message": "error storing datas"
                    });
                }
              break;           
              // todo add for rh et co2                                                                                                     
            default:
              // code block
              try { 
                let status = await storedDatas.registerIntData(epoch,sensorId,Number(value));
                if (status !== 201) {
                    throw new Error("error inserting datas");
                }
                else {
                    sendJsonResponse(res,status,{
                        "message": "datas stored"
                    });
                }
            }
            catch(err) {
                // do something with error handle here ou dans la methode storedData
                console.log(err); 
                sendJsonResponse(res,500,{
                    "message": "error storing datas"
                });
            }
          } 
    }
}

/*********************************************/
/*              SETUP   FUNCTION             */
/*********************************************/
/* Méthode recevant les informations de l'arduino (sensor group) à l'allumage  [[[flowchart diagram exist]]]
    > S'il existe pas, on créer un nouveau group en base 
    > S'il existe on vérifie que les infos concordent
    > S'il en manque on les ajoute en base 
    > On accuse réception pour démarrer la réception des datas packets 
    
    CONVENTION du paquet reçu : groupid-groupname-type1-type2-type i .... 
    type répond aux conventions de l'applications aussi : valeur possible actuellement : 'temp', 'rh', 'co2'
    todo : groupname à vérifier 
*/
/**** HTTP POST GROUP SETUP  *****/
/**
* Process group setup informations sent via HTTP Post by Arduino
* @todo
*/
module.exports.groupSetup = async function groupSetup (req,res) {
    //console.log(req);
    console.log(req.body.split("-")); 
    var plainText =  req.body.split("-");
    var groupId = plainText[0];  
    var groupName = plainText[1]; 
    var timezone = plainText[2];

    var types = []; 
    for(var i=3; i<plainText.length; i++) {
        types.push(plainText[i]); 
    }
    console.log(types); 
    // todo timezone sent by Arduino ! or how ?     
    var group; 
    // find if a sensor group with that id already exists in the DB 
    try {
        if(!timezone.match(/[A-Z][a-z]+\/[A-Z][a-z]+/)) {
            throw new Error("Error in plain text sent - timezone field")
        };
        group = await sensorGroup.getSensorGroupById(groupId);
        // pas de sensor group avec cet id en base
        if (group==null) {
            //store new sensorgroup
            // todo handle status 
            // tested with plain text: arduinoidtest-grouptest-America/Toronto-temp-temp-rh-co2-rh 
            // works; other test fot this part ? 
            let status = await sensorGroup.addSensorGroup(groupId,groupName,timezone);
            if (status!=201) {
                throw new Error("Error adding new sensor group");  
            }
            else {
                // add each sensors
                for(var i=0; i<types.length; i++) {
                    let res = await sensorGroup.addSensor(groupId,types[i]);
                    if (res!=201) {
                        throw new Error("Error adding new "+types[i]+"sensor");
                    }
                }
                // todo get back id ? non ils savent que si on a un ok la ils ajoutes les dt à leurs sensors convention : 
                // arduinoid-datatype(-count) (-count) si plusieurs sensors du même datatype
                sendJsonResponse(res,status,{
                    "message": "Sensor group and all sensors added "
                });
                // todo handle this Arduino side 
            }
        }
        // group contient le document lié à ce groupeid
        else if (!group.name || group.name==="") {
            // name ? add name if not exist todo or see where to handle group name 
            //todo (call external method)

        }
        else if (!group.timezone || group.timezone==="") {
            // todo ; add timezone if missing ? 
            // call external method 
        }
        else if (group.sensors.length != types.length) {
            // sensors missing  part todo 
            // sensor : sensorid, name, datatype 
            // name est à enlevé required et puis on peut ajouter ici 
            // todo add application side possibilité d'ajouter un nom aux sensors 

            // case : temp-temp (0 la, 1 la, 2 la) temp (0-1 stocké) 
            // Je me demande si ce serait pas mieux de faire côté arduino side d'envoyer les datatype-1 si y'en a 2 du même type 
            // sinon ici je pourrai check dans l'array type combien d'occurence de chaque mot 

            //thanks to corashina comment : https://stackoverflow.com/questions/5667888/counting-the-occurrences-frequency-of-array-elements 
            const map1 = types.reduce((acc, e) => acc.set(e, (acc.get(e) || 0) + 1), new Map()); 
            var realTypesOcc = [...map1.entries()]; 
            var dbTypes = []; 
            group.sensors.forEach(elem => {
                dbTypes.push(elem.dataType); 
            });
            const map2 = dbTypes.reduce((acc, e) => acc.set(e, (acc.get(e) || 0) + 1), new Map()); 
            var dbTypesOcc = [...map2.entries()]; 
            // realTypesOcc & dbTypesOcc sont des array de la forme : [ ['datatype', nombre occurence], ..]
            // a partir de la on vérifie si les datatypes "réels" et ceux en base sont équivalent un a un, on détecte qu'un sensor manque en base: on l'insère
            realTypesOcc.forEach(realE => {
                dbTypesOcc.forEach( async dbE => {
                    if (dbE[0]==realE[0]) {
                        if (dbE[1]<realE[1]) {
                            // nb de datatype réel envoyé par l'arduino supérieur à ceux en base, on ajoute le nombre de sensors non encore enregistrés
                            var nbToInsert = realE[1]-dbE[1] ; 
                            for (i=0; i<nbToInsert; i++) {
                                var status = await sensorGroup.addSensor(groupId,realE[0]); 
                                if (status!=201) {
                                    throw new Error("Error adding new"+realE[0]+"sensor");
                                }
                            }
                            sendJsonResponse(res,status, {
                                "message": "New sensor(s) successfully added"
                            })
                        }
                        else if (dbE[1]>realE[1]) {
                            // todo remove sensor, which one? how to now ? issue 
                            // need name or todo in application side ! 
                            // send log error to application? 
                        }
                    // sinon c'est ok, le nombre de sensors de tel datatype correspondent, on passe au suivant (forcément un qui diffère si on entre ici)
                    // tested with sequence : arduinoidtest-grouptest-America/Toronto-temp-rh-co2
                    //arduinoidtest-grouptest-America/Toronto-temp-rh-co2-rh
                    // arduinoidtest-grouptest-America/Toronto-temp-rh-co2-rh-temp-temp
                    // works 
                    }
                });
            });
        }
        else {
            // All is already registered
            sendJsonResponse(res,status, {
                "message" : "ok"
            });

        }
    }
    catch (err) {
        console.error(err.name+" : "+err.message); 
        // reponse sent to arduino (relevant message?)
        sendJsonResponse(res,500,err.message); 
        
    }
}


//com 1
   /*     // get datatype querying (version avant 30/04)
        try {
        // find the sensor to check what will be the "value" field 
        // help https://stackoverflow.com/questions/21142524/mongodb-mongoose-how-to-find-subdocument-in-found-document 
          //  timezoneDataType = await sensorGroup.getDataTypeAndTimezoneBySensorId(sensorId);
            dataType = await sensorGroup.getDataTypeBySensorId(sensorId); 
        }
        catch (err) {
            // todo how to handle error 
            console.log("error caught from 'getDataTypeById' method : ");
            console.log(err);
            // use send JSON response ? 
        } */
        //dataType= timezoneDataType.dataType;
      //  console.log("datatype : "+ dataType);
        // get timezone name 
       // timezone = timezoneDataType.timezone; 

/**************************************/
/*        TESTING FUNCTION            */
/**************************************/
module.exports.printPost = function (req, res) {
    // console.log(req);
     console.log(req.params.sensorid+ " --");
     console.log(req.body) ; 
     sendJsonResponse(res,200,{
         "message": "post received"
     }); // en profiter pour renvoyer quelque chose ? Pas au format JSON? 
     // also todo : limit amount of incoming datas // de base limité par express .. pas sur nécessaire (lib : stream-meter for example)
 } 

/********************************************/
/*        OLD & OTHERS FUNCTIONS            */
/********************************************/
/*
splitReceivedText = function (text) {
    // todo : add test validation and errors ?
    var res = new Object();
    var dateTimeValue = text.split(" ");
    var yearMonthDay = dateTimeValue[0].split("/");
    var hourMinuteSecond = dateTimeValue[1].split(":");
    res.year= "20"+yearMonthDay[0];
    res.month=yearMonthDay[1];
    res.day=yearMonthDay[2];
    res.hour=hourMinuteSecond[0];
    res.minute=hourMinuteSecond[1]; 
    res.second=hourMinuteSecond[2];
    res.value=dateTimeValue[2];
    return res;
}*/

// from date 
getUTCDateFromPostText = function (body) {
    //todo add validation tests and errors
    var dateTimeValue = body.split(" ");
    var yearMonthDay = dateTimeValue[0].split("/");
    var hourMinuteSecond = dateTimeValue[1].split(":"); 
    // Date.UTC(year[, month[, day[, hour[, minute[, second[, millisecond]]]]]]) 
    //https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/UTC
    // todo tests 
    // year : fullyear, month 0-11, day 1-31, time 0-;; 
    var d = new Date(); 
    console.log(d.getTimezoneOffset()); 
    return new Date(Date.UTC("20"+yearMonthDay[0],Number(yearMonthDay[1])-1,yearMonthDay[2],hourMinuteSecond[0],hourMinuteSecond[1],hourMinuteSecond[2]));
}

// from Arduino Epoch 
// epoch du body en second, return epoch en milisecond (bon format pour mongoose et momentjs)
getEpochFromPostText = function (body) {
    return 1000*body.split(" ")[0];
}
/*
// old version
getValueFromPostText = function (body) {
    //todo add validation tests and errors
    var dateTimeValue = body.split(" ");
    return dateTimeValue[2]; 
}*/
getValueFromPostText = function(body) {
    return body.split(" ")[1];
}

  
        // Old versions working with promise and callback 
        // sensorGroup.getTest4(sensorId)
        // .then(res => {
        //     console.log("TEST4")
        //     console.log(res)
        //    // console.log(res.dataType)
        // })  
        // .catch(err => {
        //     console.log(err)
        // })

       /* sensorGroup.getTest5(sensorId,function(err, dataType) {
            if (err) {
                console.log(err)
                //send Json rep .
            }
            else {
                console.log("TEST5")
                console.log(dataType)               
            }
        }) */