import popup from 'components/popup.js';

Tactics.App = (function ($, window, document) {
  'use strict';

  var self = {};
  var game;
  var pointer;
  var fullscreen = Tactics.fullscreen;
  var set = [
    // Back Row
    {assignment:[5, 0], type:'Cleric'},
    // Middle Row
    {assignment:[2, 1], type:'DarkMagicWitch'},
    {assignment:[3, 1], type:'Pyromancer'},
    {assignment:[7, 1], type:'Pyromancer'},
    {assignment:[8, 1], type:'Enchantress'},
    // Front Row
    {assignment:[1, 2], type:'Assassin'},
    {assignment:[4, 2], type:'Knight'},
    {assignment:[5, 2], type:'Knight'},
    {assignment:[6, 2], type:'Knight'},
    {assignment:[9, 2], type:'Scout'},
  ];
  var gameStateData = {
    teams: [
      {
        colorId: 'Blue',
        set: set,
      },
      {
        colorId: 'Red',
        set: set,
      },
    ],
  };

  var buttons = {
    swapbar: function () {
      var $active = $('#game > .buttons.active');
      var $next = $active.next('.buttons');

      if (!$next.length)
        $next = $('#game > .buttons').first();

      $active.removeClass('active');
      $next.addClass('active');
    },
    resize:fullscreen.toggle,
    movebar: function ($button) {
      $('#app').toggleClass('left right');
      $button.toggleClass('fa-rotate-270 fa-rotate-90');
    },
    lock: function ($button) {
      $button.toggleClass('fa-lock fa-unlock');

      if ($button.hasClass('fa-lock'))
        game.panzoom.lock();
      else
        game.panzoom.unlock();
    },
    rotate: function ($button) {
      let classesToToggle;

      if ($button.hasClass('fa-rotate-90'))
        classesToToggle = 'fa-rotate-90 fa-rotate-180';
      else if ($button.hasClass('fa-rotate-180'))
        classesToToggle = 'fa-rotate-180 fa-rotate-270';
      else if ($button.hasClass('fa-rotate-270'))
        classesToToggle = 'fa-rotate-270';
      else
        classesToToggle = 'fa-rotate-90';

      $button.toggleClass(classesToToggle);
      game.rotateBoard(90);
    },
    sound: function ($button) {
      $button.toggleClass('fa-bell fa-bell-slash');

      Howler.mute($button.hasClass('fa-bell-slash'));
    },
    undo: function () {
      game.undo();
    },
    select: function ($button) {
      let mode = $button.val();

      if (mode == 'turn' && $button.hasClass('ready')) {
        $('BUTTON[name=select][value=turn]').removeClass('ready');
        return game.zoomToTurnOptions();
      }

      game.selectMode = mode;
    },
    pass: function () {
      game.pass();
    },
    surrender: function () {
      let resetPopup = popup({
        message: 'Are you sure you want to reset the game?',
        buttons: [
          {
            label: 'Yes',
            onClick: () => {
              let momentPopup = popup({
                message: 'One moment...',
                buttons: [],
              });

              game.restart().then(() => {
                momentPopup.close();
                $('BUTTON[name=surrender]').removeClass('ready');
              });
            },
          },
          {
            label: 'No',
          },
        ],
      });
    }
  };

  $(() => {
    if ('ontouchstart' in window) {
      $('body').addClass(pointer = 'touch');
    }
    else {
      $('body').addClass(pointer = 'mouse');
    }

    $('#loader').css({
      top:($(window).height()/2)-($('#loader').height()/2)+'px',
      left:($(window).width()/2)-($('#loader').width()/2)+'px',
      visibility:'visible'
    });

    if (!fullscreen.isAvailable())
      $('BUTTON[name=resize]').toggleClass('hidden');

    if (Howler.noAudio)
      $('BUTTON[name=sound]').toggleClass('hidden');

    $('BODY')
      /*
       * Under these conditions a special attack can be triggered:
       *   1) The unit is enraged and selected in attack mode. (selector)
       *   2) The attack button is pressed for 2 seconds and released.
       */
      .on('mousedown touchstart', '#app BUTTON:enabled[name=select][value=attack].ready', event => {
        let readySpecial = game.readySpecial();
        let button = event.target;
        let eventType = pointer === 'touch' ? 'touchend' : 'mouseup';

        $(document).one(eventType, event => {
          if (event.target === button)
            readySpecial.release();
          else
            readySpecial.cancel();
        });
      })
      .on('mouseover','#app BUTTON:enabled', event => {
        var $button = $(event.target);

        // Ignore disabled buttons
        if (window.getComputedStyle(event.target).cursor !== 'pointer')
          return;

        Tactics.sounds.focus.play();
      })
      .on('click','#app BUTTON:enabled', event => {
        var $button = $(event.target);
        var handler = $button.data('handler') || buttons[$button.attr('name')];

        // Ignore disabled buttons
        if (window.getComputedStyle(event.target).cursor !== 'pointer')
          return;

        handler($button);

        Tactics.sounds.select.play();
      });

    Tactics.createLocalGame(gameStateData).then(g => {
      game = g;
      loadThenStartGame();
    });
  });

  $(window).on('resize', () => {
    let $resize = $('BUTTON[name=resize]');
    if (fullscreen.isEnabled() !== $resize.hasClass('fa-compress'))
      $resize.toggleClass('fa-expand fa-compress');

    if (game) game.resize();
  });

  function loadThenStartGame() {
    let $card = $(game.card.canvas)
      .attr('id', 'card')
      .on('transitionend', event => {
        // An invisible overlapping card should not intercept the pointer.
        let opacity = $card.css('opacity');
        let pointerEvents = opacity === '0' ? 'none' : '';

        $card.css({ pointerEvents:pointerEvents });
      })
      .appendTo('#field');

    $(game.canvas)
      .attr('id', 'board')
      .appendTo('#field');

    $(window).trigger('resize');

    game
      .on('selectMode-change', event => {
        let panzoom     = game.panzoom;
        let old_mode    = event.ovalue;
        let new_mode    = event.nvalue;
        let can_move    = game.canSelectMove();
        let can_attack  = game.canSelectAttack();
        let can_special = game.canSelectSpecial();
        let can_undo    = game.canUndo();

        $('BUTTON[name=select]').removeClass('selected');
        $('BUTTON[name=select][value='+new_mode+']').addClass('selected');

        if (new_mode === 'target')
          $('BUTTON[name=select][value=attack]').addClass('selected targeting');
        else if (old_mode === 'target')
          $('BUTTON[name=select][value=attack]').removeClass('targeting');

        if (!$('#game-play').hasClass('active')) {
          $('.buttons').removeClass('active');
          $('#game-play').addClass('active');
        }

        $('BUTTON[name=select][value=move]').prop('disabled', !can_move);
        $('BUTTON[name=select][value=attack]').prop('disabled', !can_attack);
        $('BUTTON[name=undo]').prop('disabled', !can_undo);

        if (new_mode === 'attack' && can_special)
          $('BUTton[name=select][value=attack]').addClass('ready');
        else
          $('BUTton[name=select][value=attack]').removeClass('ready');

        if (new_mode === 'turn' && panzoom.canZoom() && game.selected && !game.viewed)
          $('BUTTON[name=select][value=turn]').addClass('ready');
        else
          $('BUTTON[name=select][value=turn]').removeClass('ready');

        if (new_mode === 'ready')
          $('BUTTON[name=pass]').addClass('ready');
        else
          $('BUTTON[name=pass]').removeClass('ready');

        // Automatically lock panzoom for improved game interaction
        if (!panzoom.locked)
          buttons.lock($('BUTTON[name=lock]'));
      })
      .on('card-change', event => {
        if (event.nvalue && event.ovalue === null)
          $card.addClass('show');
        else if (event.nvalue === null)
          $card.removeClass('show');
      })
      .on('lock-change', event => {
        if (event.nvalue === 'gameover') {
          $('#app').addClass('gameover');
          $('BUTTON[name=surrender]').addClass('ready');
        }
        else
          $('#app').removeClass('gameover');

        if (event.nvalue)
          $('#app').addClass('locked');
        else
          $('#app').removeClass('locked');
      })
      .on('progress', event => {
        let $progress = $('#progress');
        let percent = event.percent;

        $progress.width(percent);
      })
      .on('ready', () => {
        let action = pointer === 'mouse' ? 'Click' : 'Tap';

        $('#loader')
          .addClass('complete')
          .one('click', () => {
            $('.message').text('One moment...');

            game.start().then(() => {
              $('#splash').hide();
              $('#app').addClass('show');
            });
          })
          .find('.message')
            .text(action+' here to play!')
      });
  }

  return self;
})(jQuery,window,document);
