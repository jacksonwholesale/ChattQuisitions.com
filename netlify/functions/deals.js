exports.handler = async function(event, context) {

  const token = process.env.AIRTABLE_TOKEN;

  const base  = process.env.AIRTABLE_BASE;

  if (!token || !base) {

    return {

      statusCode: 500,

      body: JSON.stringify({ error: 'Missing Airtable credentials' })

    };

  }

  try {

    const url = `https://api.airtable.com/v0/${base}/Table%201?filterByFormula={Active}=1&sort[0][field]=Address&sort[0][direction]=asc`;

    const res = await fetch(url, {

      headers: { 'Authorization': `Bearer ${token}` }

    });

    if (!res.ok) throw new Error(`Airtable error: ${res.status}`);

    const data = await res.json();

    return {

      statusCode: 200,

      headers: {

        'Content-Type': 'application/json',

        'Access-Control-Allow-Origin': '*'

      },

      body: JSON.stringify(data)

    };

  } catch (err) {

    return {

      statusCode: 500,

      body: JSON.stringify({ error: err.message })

    };

  }

};
