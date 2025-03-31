import express from "express";
import cors from "cors";
import axios from 'axios'; // Ensure axios is imported
import { GraphQLClient, gql } from 'graphql-request';
import { EventSource } from 'eventsource'; // Use named import for EventSource
import { OpenAI } from "openai";
import dotenv from 'dotenv';
dotenv.config(); // Load environment variables from .env file

const app = express();
const PORT = process.env.PORT || 5004;
const apiEndpoint = process.env.API_ENDPOINT || "http://localhost:5000"
const graphQLEndpoint = "https://live.api.footium.club/api/graphql"
const matchEndpoint = "https://live.api.footium.club/api/sse"

// Middleware
app.use(express.json());
app.use(cors({
    origin: '*', // or '*' for all origins
    methods: 'GET,POST',
    allowedHeaders: 'Content-Type,Authorization'
  }));
// Sample Route
app.get("/", (req, res) => {
    res.send("Express Server is Running!");
});

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Initialize GraphQL client
const graphqlClient = new GraphQLClient(`${graphQLEndpoint}`);

const exampleMatchReport = `
An early setback - somehow
Mikel Arteta had called for a cauldron-like atmosphere inside Emirates Stadium and he got just that during the opening stages, and pushed along by the swarths of support, we dominated the early stages.

Spurs headed into the game with one win in their last eight matches, and it showed in the fist 20 minutes. They completed just four passes in our half during that period, and indeed their keeper Antonin Kinsky had the most touches for his side, but we couldn't turn that pressure into a goal.

Trossard came closest when he saw a goalbound shot cannon off the back of a defender after a corner wasn't cleared, and Kinsky twice had the ball nicked from by Kai Havertz but both times possession somehow stayed with Ange Postecoglu's side.

But after surviving the opening stages, Spurs suddenly built up a head of steam. A fine challenge from Gabriel prevented Son from converting a Djed Spence centre, and from the resulting corner David Raya made a good block to thwart Dejan Kulusevski.

However another set-piece on 24 minutes would be our undoing. A short corner was sent into a congested area by Pedro Porro, and after it was cleared to the edge of the area, Son was lurking and sent a shot back through the bodies, and aided by a deflection found the net for the eighth time in the derby.


Swift turnaround
The game became more of an even contest after that, but we kept probing and a stroke of luck saw us get level. On 38 minutes Trossard and Porro challenged for the ball on the byline and despite the ball flicking off the Belgian, we were awarded the corner - and we made the most of it.

Declan Rice swung it towards the back post where Gabriel had powered his way towards, and he got a touch on the ball which deflected off Dominic Solanke and spun into the net to get us back level and raise the decibel level in north London once again.

And it reached a crescendo four minutes later when we turned the game on its head by snatching the lead. A strong challenge by Thomas Partey won the ball on the halfway line and he found Martin Odegaard, who played a delightful pass into the galloping Trossard's path. He took two touches to get it to the edge of the box, and drilled it low and hard past Kinsky to send the derby spinning in the opposite direction.

With the stadium bouncing and the wind in our sails, we didn't want half-time to come, but even though we were forced to head into the changing rooms, we came back out displaying the same vigour.

Getting over the line
Havertz went close to sending another corner into the net when he nodded an Odegaard delivery just wide, and then the German headed straight at Kimsky when picked out in space by Partey.

One player enjoying his first taste of the derby was Lewis Myles-Skelly. Despite being the second-youngest Gunner to start in a Premier League north London derby, he looked assured in defence, regularly scrapping away to win possession for his side and then confidently striding forward with the ball to start attacks.

And they kept coming for the hosts but we would be denied by Kimsky twice in quick succession on 72 minutes. Rice fizzed one at him which struck him in the chest, before Odegaard swiftly followed up with a low effort which was saved by the Czech keeper.

Our skipper again went close with six minutes to go when Kieran Tierney threaded a pass to him inside the box but he screwed it wide of the mark, but with the lead intact it was just about grinding it out.

Like most of the second 45, Spurs offered little threat but in the final minute of stoppage time, Porro wrapped a shot from a tight angle off the outside the post, but we saw out the final few seconds to stretch our unbeaten league run to 11, record our fifth Premier League double over Spurs and clinch the derby day bragging rights - again.

`



const getPlayerData = async (playerId) => {

  const playerQuery = gql`
  query {
    players(where: {id: {equals: "${playerId}"}}) {
      id
      fullName
    }
  }
  `; // Use dynamic playerId in the query

  try {
      const data = await graphqlClient.request(playerQuery); // Use dynamic query
      return data;
  } catch (error) {
      console.error('Error querying GraphQL API for player:', error);
      return null;
  }
};

const getClubData = async (teamId) => {

  const dynamicQuery = gql`
  query {
    clubs(where: {id: {equals: ${teamId}}}) {
      name
    }
  }
  `; // Use dynamic ID in the query

  try {
      const data = await graphqlClient.request(dynamicQuery); // Use dynamic query
      return data.clubs[0].name;
  } catch (error) {
      console.error('Error querying GraphQL API:', error);
      return null;
  }
};



app.get('/api/sse', async (req, res) => {
    const { fixtureId } = req.query; // Get user input for ID from query parameters
    console.log("fixtureId:", fixtureId);

    if (!fixtureId) {
        return res.status(400).json({ error: 'Match ID is required.' });
    }

    const url_partial_match = `${matchEndpoint}/partial_match/${fixtureId}`;
    const eventSourcePartial = new EventSource(url_partial_match);

    // Initialize variables
    let homeTeamWins = 0;
    let awayTeamWins = 0;
    let homeTeamId = 0;
    let awayTeamId = 0;
    let goals = [];
    let cards = [];
    let playerIdNameMap = {};
    let clubIdNameMap = {};

    // Set the response headers for SSE
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Create a Promise to handle the EventSource logic for partial data
    const processPartialData = new Promise((resolve, reject) => {
        eventSourcePartial.onmessage = async (event) => {
            const data = JSON.parse(event.data);

            if (!data) {
                return;
            }

            let playerIds = [];
            for (let player of data.state.homeTeam.lineupData.playerLineups) {
                playerIds.push(player.playerId);
            }

            for (let player of data.state.awayTeam.lineupData.playerLineups) {
                playerIds.push(player.playerId);
            }

            for (let playerId of playerIds) {
                const playerData = await getPlayerData(playerId);
                playerIdNameMap[playerId] = playerData.players[0].fullName;
            }

            homeTeamWins = data.state.homeTeam.stats.wins;
            awayTeamWins = data.state.awayTeam.stats.wins;
            homeTeamId = data.state.homeTeam.clubId;
            awayTeamId = data.state.awayTeam.clubId;
            console.log("homeTeamId", homeTeamId, "awayTeamId", awayTeamId)

            const homeTeamName = await getClubData(homeTeamId);
            const awayTeamName = await getClubData(awayTeamId);
            clubIdNameMap[homeTeamId] = homeTeamName;
            clubIdNameMap[awayTeamId] = awayTeamName;

            for (const event of data.state.keyEvents) {
                let playerId = '';
                if (event.type == 2) {
                    playerId = event.playerId;
                } else if (event.type == 0) {
                    playerId = event.scorerPlayerId;
                }

                if (event.type == 2) {
                    cards.push({
                        "team": clubIdNameMap[event.clubId],
                        "card_receiver": playerIdNameMap[event.playerId],
                        "card_receiver_id": event.playerId,
                        "card_time": event.timestamp
                    });
                } else if (event.type == 0) {
                    goals.push({
                        "team": clubIdNameMap[event.clubId],
                        "goal_scorer": playerIdNameMap[event.scorerPlayerId],
                        "goal_scorer_id": event.scorerPlayerId,
                        "goal_time": event.timestamp
                    });
                }
            }

            eventSourcePartial.close();
            resolve();
        };

        eventSourcePartial.onerror = (error) => {
            console.error('EventSource failed:', error);
            eventSourcePartial.close();
            reject(new Error('EventSource error'));
        };
    });

    // Await the Promise before running the next part of your code
    await processPartialData;

    const url_match_frames = `${matchEndpoint}/match_frames/${fixtureId}`;
    const eventSourceFrames = new EventSource(url_match_frames);

    let digest = ''
    let imageUrl = ''

    eventSourceFrames.onmessage = async (event) => {
        const data = JSON.parse(event.data);

        if (!data) {
            return;
        }

        const sequentialEvents = data.map(event => {
            return `
                Type: ${event.eventTypeAsString}, 
                Team: ${clubIdNameMap[event.teamInPossession]}, 
                Player: ${playerIdNameMap[event.playerInPossession]}`;
        }).join('\n');

        if (sequentialEvents) {
            // Calculate total goals for each team
            const homeTeamGoals = goals.filter(goal => goal.team === clubIdNameMap[homeTeamId]).length;
            const awayTeamGoals = goals.filter(goal => goal.team === clubIdNameMap[awayTeamId]).length;

            // Include the overall score in the message
            const message = `   

You are a reporter for a football website or publication like "the Athletic". This is an example of a match report:
${exampleMatchReport}

Note the goals - who scored, and when. ${goals.map(goal => `${goal.team} - ${goal.goal_scorer}`).join('\n')}
Overall Score: ${clubIdNameMap[homeTeamId]} ${homeTeamGoals} - ${awayTeamGoals} ${clubIdNameMap[awayTeamId]}

You are given a passage of play, abstracted from a football match into a coherent narrative.
Your job is to digest this passage of play, and provide a concise summary of the events that occurred.

Note the cards - who received them, and when. ${cards.map(card => `${card.team} - ${card.card_receiver}`).join('\n')}

Don't make any reference to the particular timestamp of the events, just describe the events in order.

${sequentialEvents}. 
                  ` 
            try {
              const completion = await openai.chat.completions.create({
                  model: "gpt-4o-mini",
                  messages: [
                      { role: "system", content: message
                      }
                   ],
                   max_tokens: 1000,
              });
              console.log("completion", completion)
              digest = completion.choices[0].message.content

              const imageResponse = await openai.images.generate({
                model: "dall-e-3",
                prompt: `A scene from this match: ${digest}`,
                n: 1,
                size: "1024x1024",
                quality: "standard",
               });
            
            imageUrl = imageResponse.data[0].url;
        
              

            } catch (error) {
                console.error('Error querying OpenAI API:', error);
                console.log("res.headersSent 1", res.headersSent)
                console.log("res.headersSent 2", res.headersSent)
            }
            
            eventSourceFrames.close();
            console.log("homeTeamGoals",homeTeamGoals, "awayTeamGoals", awayTeamGoals)
            console.log(digest, imageUrl, homeTeamGoals, awayTeamGoals, goals, cards)
            try {
                console.log("res.headersSent 3", res.headersSent)
                res.json({ 
                    digest: digest, 
                    imageUrl: imageUrl,
                    goals: goals, 
                    cards: cards, 
                    homeTeamGoals: homeTeamGoals, 
                    homeTeamName: clubIdNameMap[homeTeamId],
                    awayTeamGoals: awayTeamGoals, 
                    awayTeamName: clubIdNameMap[awayTeamId]
                });
            } catch (error) {
                console.error('Error sending response:', error);
            }
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
