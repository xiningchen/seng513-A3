let app = require('express')();
let http = require('http').Server(app);
let port = 3000;
let io = require('socket.io')(http);

// cookie stuff
var cookieParser = require('cookie-parser');
app.use(cookieParser());

// variables
let registeredUsers = [];
let currentUsers = [];
let chatHistory= [];

// constants
const colorCommand = "/nickcolor";
const unCommand = "/nick";
const commandMsg = "Type /nickcolor RRGGBB to change your message color. Type /nick <new nickname> to change your nickname.";
const maxPopulation = 100;


app.get('/', function(req, res){
    // see if user has a cookie
    if(req.cookies["chatSession"]){
        // cookie exist, check if cookie is registered
        let registered = findKey(req.cookies["chatSession"], registeredUsers);
        if(registered !== -1){
            // cookie exist and registered - check if that cookie is "active"
            if(findKey(req.cookies["chatSession"], currentUsers) === -1){
                // this cookie is not active, hence check that their old UN is unique and get ready to connect
                let r = findKey(req.cookies["chatSession"], registeredUsers);
                let oldUN = registeredUsers[r].UN;

                // if un is in current users list, then must generate a new un
                let r1 = findUN(oldUN);
                if(r1 !== -1){
                    // generate new UN
                    registeredUsers[r].UN = generateUN(getCurrentUNs());
                }
            }else{
                // this cookie is already active (browser already have chat)
                // do nothing for now, but this will be caught when socket connects
            }
        }else{
            // treat as new user
            let newKey = generateKey();
            res.cookie("chatSession", newKey,  {maxAge: 999999999999});
            // register the user
            registeredUsers.push({key: newKey, UN: generateUN(getCurrentUNs())});
        }

    }else{
        // user has no cookies, give him one
        let newKey = generateKey();
        res.cookie("chatSession", newKey,  {maxAge: 999999999999});
        // register the user
        registeredUsers.push({key: newKey, UN: generateUN(getCurrentUNs())});
    }

    res.sendFile(__dirname + '/index.html');
});



io.on('connection', function(socket){
    // ask for their cookie UN
    socket.emit('who are you', "");

    // ---------------------------------  functions when connection is established
    // welcome user
    socket.on('my name is', function(myID){
        // check that their ID is registered...
        if(findKey(myID, registeredUsers)=== -1){
            // not registered... => server went down and user didn't refresh page...
            // register cookie
            registeredUsers.push({key: myID, UN: generateUN(getCurrentUNs())});
        }

        // get their UN from their ID and check if they are already active
        if(findKey(myID, currentUsers) === -1){
            // not active! great!
            let newUser = {id: socket.id, key: myID, UN: registeredUsers[findKey(myID, registeredUsers)].UN, color: "#B7501C"};
            currentUsers.push(newUser);

            //console.log("New user = " + newUser.UN);

            // populate chat history
            if (chatHistory.length>0){
                //socket.emit('chat history', chatHistory);
                for(let c in chatHistory){
                    socket.emit('chat message', chatHistory[c]);
                }
            }

            // welcome user!
            let res = {un: newUser.UN, msg: commandMsg};
            socket.emit('welcome', res);          // send a message to user


            // update current user list to everyone
            io.emit('updateUserList', getCurrentUNs());
        }else{
            // user is active, hence send them an error message
            // console.log("do you have duplicate tabs?");
            // otherwise, user already exist, they are trying to open 2 chat windows in same browser
            socket.emit('duplicate tab', "You are already in the chat using another tab!");
        }

    });


    // user disconnects
    socket.on('disconnect', function(){
        //console.log("DISCONNECT REQEUST!!!");

        // delete active user
        for(let u in currentUsers){
            if(currentUsers[u].id === socket.id){
                currentUsers.splice(u, 1);     // remove user
            }
        }

        io.emit('updateUserList', getCurrentUNs());
    });



    // user sends a message
    socket.on('chat message', function(msg){
        // process chat message
        msg = msg.trim();

        if(msg.length>0){
            // find the user index
            let index=0;
            for(let u in currentUsers){
                if(currentUsers[u].id === socket.id){
                    index=u;
                }
            }

            let words = msg.split(" ");
            if(words.length === 1){
                // uh... I guess just print this message???
                let date = new Date();

                let res = {date: dateToString(date), name: currentUsers[index].UN, msg: ": " + msg, color: currentUsers[index].color};
                socket.emit('my message', res);
                socket.broadcast.emit('chat message', res);

                // store message into history
                chatHistory.push(res);
                // check if storage too large (set max=300)
                if(chatHistory.length > 300){
                    chatHistory.splice(0, 100);             // remove earliest 100 messages
                }

            }else{
                // determine message type
                if(words[0]===colorCommand){
                    console.log("user wants to change nickname color");
                    if(words[1].length === 6){
                        // the first value should not be a #
                        console.log("Should not have #?: " + words[1].charAt(0) !== '#');
                        // add a #
                        if(words[1].charAt(0) !== '#'){
                            currentUsers[index].color = "#" + words[1];
                        }
                    }else if(words[1].length === 7){
                        // the first value should be a #
                        console.log("Char at 0 === # is: " + words[1].charAt(0) === '#');
                        if(words[1].charAt(0) === '#'){
                            currentUsers[index].color = words[1];
                        }
                    }

                }else if(words[0] === unCommand){
                    console.log("user wants to change nickname");
                    // get user's desired un
                    let wantUN = words[1];

                    // get current username list
                    let existingUNs = getCurrentUNs();

                    let res = {};
                    // check if username exists
                    for(let u in existingUNs){
                        if(existingUNs[u] === wantUN){
                            // un exists, cannot change
                            res = {status: 0, msg: "The username "+ wantUN + " is already taken."};         // ***********
                        }
                    }
                    if(!res.hasOwnProperty('status')){
                        // un DNE, therefore change permitted
                        res = {status: 1, msg: wantUN};                 // ***********

                        // change
                        currentUsers[index].UN = wantUN;
                        let uK = currentUsers[index].key;
                        let kIndex = findKey(uK, registeredUsers);
                        registeredUsers[kIndex].UN = wantUN;


                        io.emit('updateUserList', getCurrentUNs());
                    }
                    socket.emit('change UN', res);
                }else{
                    // regular chat message
                    let date = new Date();

                    let res = {date: dateToString(date), name: currentUsers[index].UN, msg: ": " + msg, color: currentUsers[index].color};
                    socket.emit('my message', res);
                    socket.broadcast.emit('chat message', res);

                    // store message into history
                    chatHistory.push(res);
                    // check if storage too large (set max=300)
                    if(chatHistory.length > 300){
                        chatHistory.splice(0, 100);             // remove earliest 100 messages
                    }
                }
            }
        }
    });

});


http.listen(port, function(){
    console.log('listening on *:'+port);
});


// use a random number generator to generate a random number between 1 - 100.
// Ensure no duplicates
generateUN = function(currentUNs){
    let rnum = Math.ceil(Math.random()*maxPopulation);

    while(currentUNs.indexOf("User"+rnum) !== -1){
        // name exists, regenerate
        rnum = Math.floor(Math.random()*maxPopulation);
    }

    return "User"+rnum;
};


// get all the active usernames
getCurrentUNs = function(){
    let currentUNs=[];

    for(let u in currentUsers){
        currentUNs.push(currentUsers[u].UN);
    }

    return currentUNs;
};


// go through active users and get their keys
getCurrentKeys = function(){
    let currentKeys=[];

    for(let u in currentUsers){
        currentKeys.push(currentUsers[u].key);
    }

    return currentKeys;
};

// find the index of 'un' in the list of active usernames
findUN = function(un){
    let unique=-1;

    for(let u in currentUsers){
        if(currentUsers[u].UN === un){
            unique=u;
            break;
        }
    }

    return unique;
};

// find the index of the given key in the given list
findKey = function(myKey, list){
    let unique=-1;

    for(let u in list){
        if(list[u].key === myKey){
            unique=u;
            break;
        }
    }

    return unique;
};


// generate an unique key string
generateKey = function(){
    let newK = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);      // key generation code taken from: https://gist.github.com/6174/6062387

    // check key
    let currentKeys = getCurrentKeys();
    while(currentKeys.indexOf(newK) !== -1){
        newK = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);      // key generation code taken from: https://gist.github.com/6174/6062387
    }

    return newK;
};

// convert date object to string
dateToString = function(date){
    let min = date.getMinutes().toPrecision(2);
    min = min.replace(".", "");
    let dateString = date.getHours() + ":" + min + " ";

    return dateString;
};