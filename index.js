import axios from "axios";
import cheerio from "cheerio"
import twilio from "twilio";
import winston from "winston";

//====CONSTANTS
const LINK_URL = "https://www.eticket.co/masinformacion.aspx?idevento=13592"


// Should infinite loop continue?
let continueLoop = true
//Simple function that does a thread sleep
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

const timezoned = () => {
    return new Date().toLocaleString('en-US', {
        timeZone: 'America/Bogota'
    });
}

//Winston logging configuration
const { combine, timestamp, label, printf } = winston.format;
const format = printf(({ level, message, timestamp }) => {
    return `${timestamp} ${level}: ${message}`;
});

const logger = winston.createLogger({
    level: 'debug',
    format: combine(
        timestamp({format: timezoned}),
        format
    ),

    defaultMeta: { service: 'user-service' },
    transports: [
        //
        // - Write all logs with level `error` and below to `error.log`
        // - Write all logs with level `info` and below to `combined.log`
        //
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
        new winston.transports.Console({
            level: 'debug',
            format: winston.format.combine(
                winston.format.colorize(),
                format
            )
        })
    ],
});

// ====Twilio configuration and setup
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
let twilioClient = undefined;
let twilioMessage = "Please set the following environment variables according to this site: https://www.twilio.com/docs/voice/quickstart/node#make-an-outgoing-phone-call-with-nodejs: "
if (!accountSid) {
    twilioMessage = twilioMessage + " TWILIO_ACCOUNT_SID,"
}
if (!authToken) {
    twilioMessage = twilioMessage + " TWILIO_AUTH_TOKEN,"
}

if (!accountSid || !authToken) {
    logger.log("error", twilioMessage)
    process.exit(1)
} else {
    twilioClient = twilio(accountSid, authToken)
}

// Code that runs once users should be notified
const triggerNotification = async (numComprar, numAgotados, response) => {
    logger.info(`A change has been detected! Number of .botoncompras found: ${numComprar}. Number of .botonagotado found: ${numAgotados}. Triggering calls and messages`)
    logger.debug(`The response: ${JSON.stringify(response)}`)
    try {
        const call = await twilioClient.calls.create(
            {
                twiml: "<Response><Say>Hello, as of this moment Dua Lipa concert tickets have probably become available once again. I repeat, Dua Lipa concert tickets are proably available right now" +
                    "The URL will be sent to your phone via text message and email. " +
                    "This call was triggered by Diego Granada's automated program that checks Dua Lipa's concert for openings. Go get your tickets!</Say></Response>",
                to: '+573005279656',
                from: '+16265327928'
            }
        )
        logger.info(`A phone call has been made! Status: ${call.status}. Destination number: ${call.to}. Price: ${call.price + " " + call.price_unit}. SID: ${call.sid}`)
    } catch (e) {
        logger.warn("An error has occurred when calling user. Error contents: " + JSON.stringify(e, Object.getOwnPropertyNames(e)))
    }

    try {
        const message = await twilioClient.messages.create({
            body: `Hey, Dua Lipa concert tickets may have become available. Check the link here: ${LINK_URL}. 
            This message was sent by Diego Granada's automated program that checks Dua Lipa's concert for openings.`,
            from: '+16265327928',
            to: '+573005279656'
        })
        logger.info(`A messsage has beent sent! Status: ${message.status}. Destination number: ${message.to}. SID: ${message.sid}`)
    } catch (e) {
        logger.warn("An error has occurred when messaging user. Error contents: " + JSON.stringify(e, Object.getOwnPropertyNames(e)))

    }
    continueLoop = false
    logger.info("The program has successfully finished. Shutting down!")
    process.exit(0)
}



// Infinite loop that checks webpage infinitely and triggers certain actions if
while (continueLoop) {
    try {
        let response = await axios.get(LINK_URL)
        let htmlContent = response.data
        let $ = cheerio.load(htmlContent)
        let numAgotados = $(".botonagotado").length
        let numComprar = $(".botoncompra").length
        if (numComprar !== 0 && response.status === 200) {
            triggerNotification(numComprar, numAgotados, response)
        } else {
            logger.log("debug", "No favorable condition change found")
        }
        await delay(25_000 + ((Math.random() - 0.5) * 10_000))
    } catch (e) {
        logger.warn("An error has occurred when getting data from www.eticket.co. Error contents: " + JSON.stringify(e, Object.getOwnPropertyNames(e)))
    }

}
