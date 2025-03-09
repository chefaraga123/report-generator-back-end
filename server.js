import express from "express";
import cors from "cors";
import axios from 'axios'; // Ensure axios is imported
import { EventSource } from 'eventsource'; // Use named import for EventSource
import { OpenAI } from "openai";
import dotenv from 'dotenv';
dotenv.config(); // Load environment variables from .env file

const app = express();
const PORT = process.env.PORT || 5000;
const apiEndpoint = process.env.API_ENDPOINT || "http://localhost:5000"
const graphQLEndpoint = "https://live.api.footium.club/api/graphql"
const matchEndpoint = "https://live.api.footium.club/api/sse"

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

// Middleware
app.use(express.json());
app.use(cors());

// Sample Route
app.get("/", (req, res) => {
    res.send("Express Server is Running!");
});

app.get('/api/sse', async (req, res) => {
    const { fixtureId } = req.query; // Get user input for ID from query parameters
    console.log("fixtureId:", fixtureId);

    if (!fixtureId) {
        return res.status(400).json({ error: 'Match ID is required.' });
    }

    const url_partial_match = `${matchEndpoint}/partial_match/${fixtureId}`;
    const eventSourcePartial = new EventSource(url_partial_match);

    // Scope variables
    let homeTeamWins = 0;
    let awayTeamWins = 0;
    let homeTeamId = 0;
    let awayTeamId = 0;
    let goals = [];
    let cards = [];

    // Set the response headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    eventSourcePartial.onmessage = async (event) => {
        const data = JSON.parse(event.data); // Parse the incoming JSON data

        if (!data) {  // Check if the received data is falsey 
            return; // Exit the function if the data is an empty array
        }    

        homeTeamWins = data.state.homeTeam.stats.wins
        awayTeamWins = data.state.awayTeam.stats.wins
        homeTeamId = data.state.homeTeam.clubId;
        awayTeamId = data.state.awayTeam.clubId;

    
          for (const event of data.state.keyEvents) {
            let playerId = '';
            if (event.type == 2) {
              playerId = event.playerId;
            } else if (event.type == 0) {
              playerId = event.scorerPlayerId;
            }
      
            if (event.type == 2) {
              cards.push(
                {
                  "team": event.clubId,
                  "card_receiver": event.playerId,
                  "card_time": event.timestamp
                }
              );
            } else if (event.type == 0) {
              goals.push(
                {
                  "team": event.clubId,
                  "goal_scorer": event.scorerPlayerId,
                  "goal_time": event.timestamp
                }
              );
            }
          }  
        
        console.log(
            homeTeamWins,
            awayTeamWins,
            homeTeamId,
            awayTeamId,
            goals,
            cards
        )

        console.log('closing')
        eventSourcePartial.close(); // Close the EventSource connection
    }

    console.log("closing partial")

    const url_match_frames = `${matchEndpoint}/match_frames/${fixtureId}`;
    const eventSourceFrames = new EventSource(url_match_frames);

    let digest = ''
    eventSourceFrames.onmessage = async (event) => {
        const data = JSON.parse(event.data); // Parse the incoming JSON data
        // Check if the received data is an empty array

        if (!data) {  // Check if the received data is falsey 
            return; // Exit the function if the data is an empty array
        }   

        const sequentialEvents = data.map(event => {
          return `
              Type: ${event.eventTypeAsString}, 
              Team: ${event.teamInPossession}, 
              Player: ${event.playerInPossession}`;
        }).join('\n'); // Join with newlines for better readability

        const message = `   
                    digest this passage of play, abstracted from a football match into a coherent narrative:
                    ${sequentialEvents}. 
                  ` 
        try {
          const completion = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: [
                  { role: "system", content: message
                  }
              ],
          });

          console.log("Digest \n",completion.choices[0].message.content)
          digest = completion.choices[0].message.content

        } catch (error) {
            console.error('Error querying OpenAI API:', error);
            res.status(500).json({ error: 'Error querying OpenAI API', details: error.message });
        }
        


        console.log('closing')
        eventSourceFrames.close(); // Close the EventSource connection
    
        try {
            res.json({ digest: digest }); // Send the digest as JSON response
        } catch (error) {
            console.error('Error sending response:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    
        if (!responseSent) { // Ensure we end the response only if not already sent
            res.end();
        }
    };

    eventSourceFrames.onerror = (error) => {
        console.error('EventSource failed:', error);
        eventSourceFrames.close(); // Close the connection on error
        res.end(); // End the response to the client
    };

})


// Start Server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
