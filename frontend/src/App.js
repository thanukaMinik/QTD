import React, { useState } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';  

function App() {
  const [messages, setMessages] = useState([]); //Holding chat messages
  const [userInput, setUserInput] = useState(''); //holding user's input

  //Function to send message and get assistant reply
  const handleSend = async () => {
    if (!userInput.trim()) return; // Prevent empty messages

    // Add user's message to the chat
    setMessages(prevMessages => [...prevMessages, {sender: "user", text: userInput}])

    const apiUrl = 'http://localhost:5000/api/chat';

    // Send user input to the server (Node.js)
    try{
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: userInput }),
      });
  
      const data = await response.json();
  
      // Add the assistant's response to the chat
      setMessages(prevMessages => [
        ...prevMessages,
        {sender: 'assistant', text: data.reply} //add assistant reply
      ])

      setUserInput(''); // Clear input field
    }catch(error){
      console.error('Error fetching assistant reply:', error);
      setMessages(prevMessages => [
        ...prevMessages,
        {sender: 'assistant', text: 'Error fetching assistant reply'}
      ])
    }
  }


   

  return (
    <div className="container mt-5">
      <div className="card shadow-lg">
        <div className="card-header bg-primary text-white text-center">
          <h1>Stock Assistant</h1>
        </div>
        <div className="card-body chat-box" style={{ height: '400px', width: '800px', overflowY: 'auto' }}>
          {messages.length === 0 ? (
            <p className="text-muted text-center">Start a conversation...</p>
          ) : (
            messages.map((msg, index) => (
              <div
                key={index}
                className={`d-flex mb-3 ${msg.sender === 'user' ? 'justify-content-end' : 'justify-content-start'}`}
              >
                <div
                  className={`p-2 rounded ${msg.sender === 'user' ? 'bg-success text-white' : 'bg-light text-dark'}`}
                  style={{ maxWidth: '75%' }}
                >
                  <b>{msg.sender === 'user' ? 'You' : 'Stock Assistant'}: </b> {msg.text}
                </div>
              </div>
            ))
          )}
        </div>
        <div className="card-footer">
          <div className="input-group">
            <input
              type="text"
              className="form-control"
              placeholder="Type your message..."
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
            />
            <button className="btn btn-primary" onClick={handleSend}>Send</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
