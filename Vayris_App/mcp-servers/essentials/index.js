import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  { name: "essentials", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_weather",
        description: "Get current weather for a specific location",
        inputSchema: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description: "City name, e.g. 'London', 'New York'",
            },
          },
          required: ["location"],
        },
      },
      {
        name: "get_time",
        description: "Get the current time, optionally for a specific timezone.",
        inputSchema: {
          type: "object",
          properties: {
            timezone: {
              type: "string",
              description: "Timezone string, e.g., 'America/New_York'. Defaults to local system time.",
            },
          },
        },
      },
      {
        name: "get_fact",
        description: "Get a random interesting fact.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "get_weather") {
    const location = args?.location;
    try {
      // Geocode the location
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`;
      const geoRes = await fetch(geoUrl);
      const geoData = await geoRes.json();

      if (!geoData.results || geoData.results.length === 0) {
        return {
          content: [{ type: "text", text: `Could not find coordinates for ${location}.` }],
          isError: true,
        };
      }

      const { latitude, longitude, name: resolvedName, country } = geoData.results[0];

      // Fetch weather
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`;
      const weatherRes = await fetch(weatherUrl);
      const weatherData = await weatherRes.json();
      const current = weatherData.current_weather;

      const resultText = `Current weather in ${resolvedName}, ${country}:\nTemperature: ${current.temperature}°C\nWind Speed: ${current.windspeed} km/h`;
      return {
        content: [{ type: "text", text: resultText }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error fetching weather: ${error.message}` }],
        isError: true,
      };
    }
  }

  if (name === "get_time") {
    const tz = args?.timezone || undefined;
    try {
      const timeString = tz 
        ? new Date().toLocaleString("en-US", { timeZone: tz })
        : new Date().toLocaleString();
      
      return {
        content: [{ type: "text", text: `Current time ${tz ? `in ${tz}` : 'locally'}: ${timeString}` }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error fetching time: ${error.message}` }],
        isError: true,
      };
    }
  }

  if (name === "get_fact") {
    const facts = [
      "Bananas are curved because they grow towards the sun.",
      "A jiffy is an actual unit of time: 1/100th of a second.",
      "Honey never spoils. Archaeologists have found pots of honey in ancient Egyptian tombs that are over 3,000 years old and still perfectly edible.",
      "Octopuses have three hearts."
    ];
    const fact = facts[Math.floor(Math.random() * facts.length)];
    return {
      content: [{ type: "text", text: fact }],
    };
  }

  throw new Error(`Tool not found: ${name}`);
});

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Essentials MCP Server running on stdio");
}

run().catch(console.error);
