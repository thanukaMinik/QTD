const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
require('dotenv').config(); // Load environment variables
const OpenAI = require('openai'); //import OpenAI
const yahooFinance = require('yahoo-finance2').default



const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());

app.use(cors({
    origin: ['http://localhost:3000'], // Allow only your frontend to access the API
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true // Allow credentials (if needed)
}));


const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY //Access api key from environment variable
});

let assistantId; //variable to store assitant ID
let threadId; //variable to store thread ID

let memory = {}; // In-memory storage for memory functionality


//Function to create Assistant on server start
async function createAssistant() {
    try {
        const assistant = await openai.beta.assistants.create({
            name: "Stock Assistant",
            instructions: "You are a stock assistant that can fetch stock data, handle memory, and provide AI-powered support. Always address the user as Thanuka Minik.",
            tools: [{ type: "code_interpreter" },
                {
                    type: "function",
                    "function":{
                        "name": "getStockPrice",
                        "description": "Get the current stock price of a company using its stock symbol",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "symbol": {
                                    "type": "string",
                                    "description": "Stock symbol (e.g., 'AAPL' for Apple)"
                                }
                            },
                            "required": ["symbol"]
                        }

                    }
                }

            ], // Adding tools like code interpreter
            model: "gpt-4o"
        });
        assistantId = assistant.id; //store the assitant id
        console.log("Assistant created successfully", assistantId);
    }catch (error) {
        console.log("Error creating assitant", error)
    }
}

//function to create thread when conservation starts
async function createThred() {
    try{
        const thread = await openai.beta.threads.create();
        threadId = thread.id;
        console.log("Thread create successfully", threadId);
    }catch(error){
        console.log("error creating thread", error);
    }
}

//fetch real time stock price using API
async function getStockPrice(symbol) {
    try{
        const quote = await yahooFinance.quote(symbol)
        return{
            symbol: symbol,
            print: quote.regularMarketPrice,
            currency: quote.currency
        }
    }catch(error){
        console.error(`Error fetching stock price for ${symbol}: ${error}`);
        throw error;
    }
}


function logChatHistory(userMessage, assistantReply) {
    const logEntry = `User: ${userMessage}\nAssistant: ${assistantReply}\n\n`;
    fs.appendFile('chat_history.txt', logEntry, (err) => {
        if (err) {
            console.error('Error writing to file:', err);
        }
    });
}

app.post('/api/chat', async (req, res) => { // Updated endpoint path
    const userMessage = req.body.message;

    console.log("Assistant ID:", assistantId);
    console.log("Thread ID:", threadId);


    // Memory command handling
    if (userMessage.toLowerCase().startsWith("remember")) {
        const information = userMessage.slice(8).trim();
        memory[information] = true;
        logChatHistory(userMessage, `I'll remember that: "${information}"`);
        return res.json({ reply: `I'll remember that: "${information}"` });
    } else if (userMessage.toLowerCase().startsWith("what do you remember")) {
        const remembered = Object.keys(memory).join(", ");
        const reply = remembered ? `I remember: ${remembered}` : "I don't remember anything yet.";
        logChatHistory(userMessage, reply);
        return res.json({ reply: reply });
    } else if (userMessage.toLowerCase().startsWith("forget")) {
        const information = userMessage.slice(7).trim();
        delete memory[information];
        const reply = `I've forgotten: "${information}"`;
        logChatHistory(userMessage, reply);
        return res.json({ reply: reply });
    }

    // OpenAI API interaction using Assistant, Thread and Message features
   try{
    console.log("Before creating message - Assistant ID:", assistantId);
    console.log("Before creating message - Thread ID:", threadId);

    await createThred(); //To prevent reusing the same content

    if(!assistantId || !threadId){
        console.error("Assistant ID or Thread ID is missing")
        return res.status(500).json({error: "Assistant or thread not initialized"})
    }


    //create a new message in the thread
    const messageResponse = await openai.beta.threads.messages.create(threadId, {
        role: "user",
        content: userMessage
    })

    // Log the entire message creation response
    console.log("Message creation response:", JSON.stringify(messageResponse, null, 2));

    //Use created message ID for streaming the response
    const messageId = messageResponse.id;
   

    //stream the assistance response
    const run = await openai.beta.threads.runs.create(threadId, {
        assistant_id: assistantId,
        instructions: userMessage,
    
    })

    console.log(run);

    const runId = run.id;

    //Check the status is completed (if complete print all the messages from the thread)
    const checkStatusAndPrintMessages = async (threadId, runId) => {
        let runStatus = await openai.beta.threads.runs.retrieve(threadId, runId);
        console.log(runStatus)

        if(runStatus.status === "completed"){
            let messages = await openai.beta.threads.messages.list(threadId);
            let assistantReply = '';
            messages.data.forEach((msg) => {
                const role =  msg.role;
                const content = msg.content[0].text.value;
                console.log(
                    `${role.charAt(0).toUpperCase() + role.slice(1)}: ${content}`
                )

                //capture the assistant reply to return to the frontend
                if(role === "assistant"){
                    assistantReply = content;
                }
            })
            
            clearInterval(global.intervelId);
            assistantReply = assistantReply || "I'm sorry, I couldn't generate a response. Please try again.";
            logChatHistory(userMessage, assistantReply)
            res.json({reply: assistantReply})
        }else  if(runStatus.status === "requires_action"){
            console.log("Requires action");

            const requiredActions = runStatus.required_action.submit_tool_outputs.tool_calls;
            console.log(requiredActions);

            let toolsOutput = [];

            for (const action of requiredActions){
                const funcName = action.function.name;
                const functionArguments = JSON.parse(action.function.arguments)

                if(funcName === "getStockPrice"){
                    const output = await getStockPrice(functionArguments.symbol);
                    toolsOutput.push({
                        tool_call_id: action.id,
                        output: JSON.stringify(output)
                    })
                }else{
                    console.log("Unknown function");
                }
            }

            //Submitting the tool outputs
            await openai.beta.threads.runs.submitToolOutputs(
                threadId,
                runId,
                { tool_outputs : toolsOutput}
            )

        }
        else{
            console.log("Run is not completed yet")
        }
    }

    clearInterval(global.intervelId);
    global.intervelId = setInterval(() => {
        checkStatusAndPrintMessages(threadId, runId)
    }, 5000)

   }catch(error) {
    console.error(error);
    res.status(500).json({error : 'Error communincating with OpenAI Assitant'});
   }
});

//Route to retrieve chat history
app.get('/chat-history', (req, res) => {
    fs.readFile('chat_history.txt', 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading file:', err);
            return res.status(500).json({ error: 'Error reading chat history' });
        }
        res.send(data);
    });
});


//start the server and create assistant on start
app.listen(port, () => {
    createAssistant();
    createThred(); //Start a new thread when the server starts
    console.log(`Server running on http://localhost:${port}`);
});
