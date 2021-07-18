const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const format = require("date-fns/format");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const openDbAndRunServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is running at http://localhost:3000");
    });
  } catch (e) {
    console.log(`Db error '${e.message}'`);
  }
};
openDbAndRunServer();
//
app.post("/register", async (request, response) => {
  const { username, name, gender, password } = request.body;
  const checkUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const isUserNameExists = await db.get(checkUserQuery);
  if (isUserNameExists !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    //check password length
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      //create user
      const encryptedPass = await bcrypt.hash(password, 12);
      const createUserQuery = `INSERT INTO
      user (username, name, password, gender)
     VALUES
      (
       '${username}',
       '${name}',
       '${encryptedPass}',
       '${gender}' 
      );`;
      await db.run(createUserQuery);

      response.status(200);
      response.send("User created successfully");
    }
  }
});
// login page API 2
app.post("/login", async (request, response) => {
  const { username, password } = request.body;
  const checkUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbuser = await db.get(checkUserQuery);
  if (dbuser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbuser.password);
    if (isPasswordMatched) {
      response.status(200);
      const payload = username;
      const jwtToken = jwt.sign(payload, "Ilovecoding");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});
//Authentication token
const authenticationToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "Ilovecoding", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload;
        next();
      }
    });
  }
};
//   /user/tweets/feed/ API 3
app.get(
  "/user/tweets/feed/",
  authenticationToken,
  async (request, response) => {
    const username = request.username;
    const getUserIdQuery = `SELECT * FROM user WHERE username ='${username}';`;
    const dbUser = await db.get(getUserIdQuery);
    const userId = dbUser.user_id;
    const getFollowingList = `SELECT following_user_id FROM follower WHERE follower_user_id='${userId}';`;
    const followingList = await db.all(getFollowingList);
    let followingListUserIds = [];
    for (each of followingList) {
      followingListUserIds.push(each.following_user_id);
    }
    const getLatestTweets = `SELECT 
    user.username,
    tweet.tweet,
    tweet.date_time AS dateTime
    FROM tweet 
    INNER JOIN user ON user.user_id = tweet.user_id 
    WHERE tweet.user_id IN (${followingListUserIds})
    ORDER BY date_time DESC LIMIT 4;`;
    const tweetsLatest = await db.all(getLatestTweets);
    response.send(tweetsLatest);
  }
);
// GET /user/following/ API 4
app.get("/user/following/", authenticationToken, async (request, response) => {
  const username = request.username;
  const getUserIdQuery = `SELECT * FROM user WHERE username ='${username}';`;
  const dbUser = await db.get(getUserIdQuery);
  const userId = dbUser.user_id;
  const getFollowingList = `SELECT following_user_id FROM follower WHERE follower_user_id='${userId}';`;
  const followingList = await db.all(getFollowingList);
  let followingListUserIds = [];
  for (each of followingList) {
    followingListUserIds.push(each.following_user_id);
  }
  const getFollowingNames = `SELECT name FROM user WHERE user_id IN (${followingListUserIds});`;
  const followingNames = await db.all(getFollowingNames);
  response.send(followingNames);
});
// GET /user/followers/ names API 5
app.get("/user/followers/", authenticationToken, async (request, response) => {
  const username = request.username;
  const getUserIdQuery = `SELECT * FROM user WHERE username ='${username}';`;
  const dbUser = await db.get(getUserIdQuery);
  const userId = dbUser.user_id;
  const getFollowingList = `SELECT follower_user_id FROM follower WHERE following_user_id='${userId}';`;
  const followersList = await db.all(getFollowingList);
  console.log(followersList);
  let followersListUserIds = [];
  for (each of followersList) {
    followersListUserIds.push(each.follower_user_id);
  }
  const getFollowersNames = `SELECT name FROM user WHERE user_id IN (${followersListUserIds});`;
  const followersNames = await db.all(getFollowersNames);
  response.send(followersNames);
});
//check user tweet access
const checkTweetAccess = async (request, response, next) => {
  const { tweetId } = request.params;
  const username = request.username;
  const getUserIdQuery = `SELECT * FROM user WHERE username ='${username}';`;
  const dbUser = await db.get(getUserIdQuery);
  const userId = dbUser.user_id;
  const getFollowingList = `SELECT following_user_id FROM follower WHERE follower_user_id='${userId}';`;
  const followingList = await db.all(getFollowingList);
  let followingListUserIds = [];
  for (each of followingList) {
    followingListUserIds.push(each.following_user_id);
  }

  const checkTweet = `Select * FROM tweet WHERE tweet_id = ${tweetId} AND user_id IN (${followingListUserIds});`;
  const tweet = await db.get(checkTweet);

  if (tweet === undefined) {
    response.status(400);
    response.send("Invalid Requests");
  } else {
    next();
  }
};
// /tweets/:tweetId/ Method: GET API 6
app.get(
  "/tweets/:tweetId/",
  authenticationToken,
  checkTweetAccess,
  async (request, response) => {
    const { tweetId } = request.params;
    const getTweetQuery = `
  SELECT 
  tweet.tweet,
  COUNT(like.like_id) AS likes,
  COUNT(reply.reply_id) AS replies,
  tweet.date_time AS dateTime
  FROM
  tweet INNER JOIN like
  ON tweet.tweet_id = like.tweet_id
  INNER JOIN reply 
  ON tweet.tweet_id = reply.tweet_id
  WHERE 
  tweet.tweet_id = ${tweetId}
  GROUP BY 
  tweet.tweet_id
  ;`;
    const tweet = await db.get(getTweetQuery);
    response.send(tweet);
  }
);
//GET likes API 7
app.get(
  "/tweets/:tweetId/likes/",
  authenticationToken,
  checkTweetAccess,
  async (request, response) => {
    const { tweetId } = request.params;
    const getLikedUserList = `SELECT 
        user.username
        FROM 
         user 
         INNER JOIN like 
         ON user.user_id = like.user_id
         WHERE
         like.tweet_id = ${tweetId};`;

    const usersList = await db.all(getLikedUserList);
    const usernames = [];
    for (each of usersList) {
      usernames.push(each.username);
    }
    response.send({ likes: usernames });
  }
);
//GET replies API 8
app.get(
  "/tweets/:tweetId/replies/",
  authenticationToken,
  checkTweetAccess,
  async (request, response) => {
    const { tweetId } = request.params;
    const getRepliesQuery = `SELECT 
        user.name,
        reply.reply
        FROM 
         user 
         INNER JOIN reply
         ON user.user_id = reply.user_id
         WHERE
         reply.tweet_id = ${tweetId};`;
    const replies = await db.all(getRepliesQuery);
    response.send({ replies: replies });
  }
);
// /user/tweets/ API 9
app.get("/user/tweets/", authenticationToken, async (request, response) => {
  const username = request.username;
  const getUserIdQuery = `SELECT * FROM user WHERE username ='${username}';`;
  const dbUser = await db.get(getUserIdQuery);
  const userID = dbUser.user_id;
  const getUserTweetsQuery = `
  SELECT 
  tweet.tweet,
  COUNT(like.like_id) AS likes,
  COUNT(reply.reply_id) AS replies,
  tweet.date_time AS dateTime
  FROM
  tweet INNER JOIN like
  ON tweet.tweet_id = like.tweet_id
  INNER JOIN reply 
  ON tweet.tweet_id = reply.tweet_id
  WHERE 
  tweet.user_id = ${userID}
  GROUP BY 
  tweet.tweet_id
  ;`;
  const Tweets = await db.all(getUserTweetsQuery);
  response.send(Tweets);
});
// /user/tweets/ POST tweet API 10
app.post("/user/tweets/", authenticationToken, async (request, response) => {
  const username = request.username;
  const getUserIdQuery = `SELECT * FROM user WHERE username ='${username}';`;
  const dbUser = await db.get(getUserIdQuery);
  const userID = dbUser.user_id;
  const { tweet } = request.body;
  const post_time = format(new Date(), "yyyy-MM-dd HH:mm:ss");
  const postTweetQuery = `INSERT INTO tweet(tweet,user_id,date_time)
  VALUES ('${tweet}',${userID},'${post_time}')`;
  await db.run(postTweetQuery);
  response.send("Created a Tweet");
});
// /tweets/:tweetId/ DELETE tweet API 11
app.delete(
  "/tweets/:tweetId/",
  authenticationToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const username = request.username;
    const getUserIdQuery = `SELECT * FROM user WHERE username ='${username}';`;
    const dbUser = await db.get(getUserIdQuery);
    const userId = dbUser.user_id;
    const checkTweet = `SELECT * FROM tweet WHERE tweet_id = ${tweetId} AND user_id =${userId};`;
    const tweet = await db.get(checkTweet);
    if (tweet === undefined) {
      response.status(400);
      response.send("Invalid Requests");
    } else {
      const deleteTweetQuery = `DELETE FROM tweet WHERE tweet_id = ${tweetId};`;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    }
  }
);
//export Instance
module.exports = app;
