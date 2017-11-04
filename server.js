// Dependencies
// TODO: Hey, can I convert to "import" without breaking anything?
var express = require("express");
var bodyParser = require("body-parser");
var logger = require("morgan");
var mongoose = require("mongoose");
// Requiring our Comment and Article models
var Comment = require("./models/Comment");
var Article = require("./models/Article");
// Our scraping tools
var request = require("request");
var cheerio = require("cheerio");
// Set mongoose to leverage built in JavaScript ES6 Promises
mongoose.Promise = Promise;

var port = process.env.POR;

// Initialize Express
var app = express();

// Use morgan and body parser with our app
app.use(logger("dev"));
app.use(bodyParser.urlencoded({
  extended: false
}));

// Make public a static dir
app.use(express.static("public"));

// Set Handlebars
var exphbs = require("express-handlebars");
app.set('views', './views')
app.engine("hbs", exphbs({
  defaultLayout: "main",
  extname: '.hbs'
}));
app.set("view engine", ".hbs");

// Database configuration with mongoose
mongoose.connect("mongodb://heroku_2jdkrmz1:poa3hg2luok5bbtje1nsql5btr@ds147265.mlab.com:47265/heroku_2jdkrmz1");
var db = mongoose.connection;

// Show any mongoose errors
db.on("error", function (error) {
  console.log("Mongoose Error: ", error);
});

// Once logged in to the db through mongoose, log a success message
db.once("open", function () {
  console.log("Mongoose connection successful.");
});

// ROUTES
// Default Home view
app.get("/", function (req, res) {
  // fetch articles from db
  Article.find({})
    .sort({ dateCreated: 1 })
    .exec(function (error, doc) {
      // Log any errors
      if (error) {
        console.log("Error retrieving from db:", error);
      }
      else {
        // wrap the response for handlebars' benefit
        var hbObject = {
          articles: doc
        }
        res.render('index', hbObject);
      }
    });
});

// Scrape
app.get("/scrape", function (req, res) {
  // Point request current page at SlashDot
  request("https://slashdot.org/", function (error, response, html) {
    if (error) {
      console.log("Request error:", error);
    }
    // Hand it to cheerio and assign to "$"
    var $ = cheerio.load(html);
    // To avoid sponsored advertisement articles, select only articles with ids
    $("article[id]").each(function (i, element) {
      var result = {};
      // Harvest the relevant portions of every article
      // Drop the read count after the title
      result.title = $(element).find("h2 span.story-title a").text();      
      result.link = $(element).find("h2 span.story-title a").attr("href");
      result.summary = $(element).find("div.p").text().trim();
      // Mongoose model powers activate! Form of: Article!
      // To avoid adding duplicate entries, the "update" method creates a new document only if no matching title is found.
      Article.update({ title: result.title }, result, { new: true, upsert: true, setDefaultsOnInsert: true }, function (err, doc) {

        // var entry = new Article(result);
        // save to db
        // entry.save(function (err, doc) {
        //   // Log any errors
        //   if (err) {
        //     // console.log("Saving error:", err);
        //   }
        //   // Or log the doc
        //   else {
        //     // console.log("Scrape results:", doc);
        //   }
      });
    });
    // redirect to render with new results
    res.redirect("/");
  });
});

// Add an article to, or remove from, "saved" list
app.post("/save/:route/:id", function (req, res) {
  // to allow redirecting to multiple routes, take req.param.route
  // but to redirect to '/', we'll have to pass something in and then convert to ''
  if (req.params.route === "index") {
    req.params.route = "";
  }
  // grab specific article from the db, then either add it to or remove it from the "saved" list based on the Boolean passed
  Article.findOneAndUpdate({ "_id": req.params.id }, { "saved": req.body.saved })
    .exec(function (err, doc) {
      if (err) {
        console.log(err);
      } else {
        console.log('doc', doc)
        res.redirect('/' + req.params.route);
      }
    })
});

// Render "Saved" list
app.get("/saved", function (req, res) {
  Article.find({ "saved": true })
    .populate("comments")
    .sort({dateCreated: 1})
    .exec(function (err, doc) {
      if (err) {
        console.log(err);
      } else {
        console.log(doc);
        var hbObject = {
          articles: doc
        }
        console.log('hbObject:', hbObject);
        res.render('saved', hbObject);
      }
    });
});

// Create a new comment or replace an existing comment
app.post("/comment/:id", function (req, res) {
  // Create a new comment and pass the req.body to the entry
  var newComment = new Comment(req.body);
  // And save the new comment the db
  newComment.save(function (error, doc) {
    // Log any errors
    if (error) {
      console.log(error);
    }
    // Otherwise
    else {
      // Use the article id to find and update its comments
      Article.findOneAndUpdate({ "_id": req.params.id }, {$push: { "comments": doc._id }}, {new: true})
        // Execute the above query
        .exec(function (err, doc) {
          // Log any errors
          if (err) {
            console.log(err);
          }
          else {
            res.redirect('/saved');
          }
        });
    }
  });
});

var PORT = process.env.PORT || 3000;
app.listen(PORT, function () {
  console.log("App running on port", PORT);
});