const express = require("express");
const apicache = require("apicache");

const { createFeed } = require("./feed");
const { fetchallMessages } = require("./fetch-fds");
const jurisdictionMapping = require("./jurisdictions.json");

const app = express();

let cache = apicache.middleware;

const onlyRecent = dateString => {
  const PERIOD = 1000 * 60 * 60 * 24;
  const recentTime = Date.now() - PERIOD;
  return new Date(dateString) > recentTime;
};

const preprocessPath = async path => {
  const parts = path.split("/").filter(x => x !== "");
  const jurisdictionName = parts[0];
  const terms = parts.reverse()[0];
  let jurisdictionParam = "all";
  if (parts.length > 1) {
    const allNames = jurisdictionMapping.map(({ name }) => name);
    const index = allNames.indexOf(jurisdictionName);
    if (index >= 0) {
      jurisdictionParam = jurisdictionMapping[index].id;
    } else {
      res.send("Choose from the following: " + allNames.join(" "));
      return;
    }
  }
  const reqMessages = await fetchallMessages(jurisdictionParam);
  const reg = new RegExp("(" + terms + ")", "ig");
  const reqMessagesFilterd = reqMessages.map(m => {
    m.messages = m.messages
      .filter(x => onlyRecent(x.timestamp))
      .filter(
        x => terms == null || (reg.test(x.content) || reg.test(x.subject))
      )
      .sort((a, b) => a.timestamp < b.timestamp);
    return m;
  });
  const msgsFilterd = reqMessagesFilterd.filter(x => x.messages.length);
  return { jurisdictionName, jurisdictionParam, terms, msgsFilterd, reg };
};

app.get("/min/*", cache("10 minutes"), async (req, res) => {
  const { msgsFilterd } = await preprocessPath(req.path.replace("/min/", "/"));
  const finData = msgsFilterd.map(({ id, messages }) => {
    return {
      id,
      messages: messages.map(({ id }) => id)
    };
  });
  res.json(finData);
});

app.get("/*", cache("10 minutes"), async (req, res) => {
  const {
    jurisdictionName,
    jurisdictionParam,
    terms,
    msgsFilterd,
    reg
  } = await preprocessPath(req.path);

  const onlyMsgs = msgsFilterd
    .map(({ messages }) => messages)
    .reduce((a, b) => a.concat(b), []);

  // highlight matches in bold
  onlyMsgs.forEach(x => {
    x.content = x.content.replace(reg, "<b>$&</b>");
  });

  const feed = createFeed(jurisdictionName, jurisdictionParam, terms, onlyMsgs);

  res.send(feed);
});

app.listen(5000);
