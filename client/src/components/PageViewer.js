import React, { useState } from "react";

const PageViewer = ({ onNavigate }) => {
  const [url, setUrl] = useState("https://en.wikipedia.org/wiki/Main_Page");

  const handleNavigate = (event) => {
    event.preventDefault();
    onNavigate(url);
  };

  return (
    <div>
      <form onSubmit={handleNavigate}>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button type="submit">Go</button>
      </form>
      <iframe
        src={url}
        width="100%"
        height="600px"
        title="Wikipedia Viewer"
      ></iframe>
    </div>
  );
};

export default PageViewer;
