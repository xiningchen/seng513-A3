$(function () {
    var socket = io();
    $('form').submit(function(){
        socket.emit('chat message', $('#m').val());
        $('#m').val('');
        return false;
    });

    socket.on('chat message', function(msg){
        $('#messages').append($('<li>').text(msg));
    });

    socket.on('new user', function(username){
        // expect to receive a cookie + store this cookie

        $('#usernames').append($('<li>').text(username));
        // store username in cookie
    })

    socket.on('welcome', function(username){
        $('#userTitle').html("You are " + username);
    });
});