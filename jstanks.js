"use strict";
/*
 * jstanks: A forf/tanks implementation in javascript, based on the C version.
 * Copyright (C) 2014 Alyssa Milburn
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

/*
 * Disclaimer: I warned you all that I don't know javascript.
 *
 * TODO:
 *  - memory functions
 *  - peer at the arithmetic FIXMEs
 *  - overflow/underflow checks
 *  - do the substacks properly, not as a parse-time hack
 *  - type checking
 *    (one of those two should stop '{ dup 1 exch if } dup 1 exch if' from working)
 *
 *  - tests
 *  - catch/show exceptions
 *  - save/load state from cookie
 *  - stack visualisation
 *  - display live desired/current speed, turret angle, etc
 *  - show live sensor state in the Sensors box too?
 *  - scoreboard
 *  - apply simultaneous fire fixes and/or other upstream changes
 */

var DEBUG = 0;
var rhinout = function(text) {
	if (DEBUG == 1) {
		try {
			console.log(text);
		} catch(ReferenceError) {
			java.lang.System.out.println(text);
		}
	}
}

var TAU = 2 * Math.PI;

var mod = function(a, b) { return a % b; };
var sq = function(a) { return a * a; };

var rad2deg = function(r) { return Math.floor(360*(r)/TAU); };
var deg2rad = function(r) { return (r*TAU)/360; };

/* Some in-game constants */
var TANK_MAX_SENSORS = 10;
var TANK_RADIUS = 7.5;
var TANK_SENSOR_RANGE = 100;
var TANK_CANNON_RECHARGE = 20; /* Turns to recharge cannon */
var TANK_ENABLE_TELEPORT = 1;
var TANK_TELEPORT_RECHARGE = 60;
var TANK_CANNON_RANGE = (TANK_SENSOR_RANGE / 2);
var TANK_MAX_ACCEL = 35;
var TANK_MAX_TURRET_ROT = (TAU/8);
var TANK_TOP_SPEED = 7;
var TANK_FRICTION = 0.75;
var TANK_AMMO = -1; /*  negative ammo means unlimited */
var TANK_MAX_PROGRAM_LENGTH = 0; /* positive: limit on non-whitespace chars
									  0 or less: no limit */
/* Pillar constants */
var PILLAR_MIN_RAD = 25;
var PILLAR_MAX_RAD = 35;
var PILLAR_TO_WALL = 50;

/* Object type constants */
var ObjectType = {
  TANK: 1,
  PILLAR: 2,
  LAVA: 4,
  MUD: 8
}

/* Spacing constants */
var spacing = [];
spacing[1] = 150; // tank to tank
spacing[2] = 50; // pillar to pillar
spacing[3] = 10; // tank to pillar
spacing[4] = 50; // lava to lava
spacing[5] = 20; // tank to lava
spacing[6] = 50; // pillar to lava
spacing[8] = 50; // mud to mud
spacing[9] = 20; // mud to tank
spacing[10] = 50; // pillar to mud
spacing[12] = 50; // mud to lava


/* (tank radius + tank radius)^2 */
var TANK_COLLISION_ADJ2 = ((TANK_RADIUS + TANK_RADIUS) * (TANK_RADIUS + TANK_RADIUS));

/* (Sensor range + tank radius)^2
 * If the distance^2 to the center of a tank <= TANK_SENSOR_ADJ2,
 * that tank is within sensor range. */
var TANK_SENSOR_ADJ2 = ((TANK_SENSOR_RANGE + TANK_RADIUS) * (TANK_SENSOR_RANGE + TANK_RADIUS));

var TANK_CANNON_ADJ2 = ((TANK_CANNON_RANGE + TANK_RADIUS) * (TANK_CANNON_RANGE + TANK_RADIUS));

// initial game grid spacing
var SPACING = 160;

var MEMORY_SIZE = 10;

var Forf = function() {
    this.mem = [0,0,0,0,0,0,0,0,0,0]; // initialize mem
    this.builtins = new Object();

    this.builtins["debug!"] = function(myforf) { document.getElementById('debug').innerHTML = myforf.popData(); };
    var unfunc = function(func) {
        return function(myforf) {
            var a = myforf.popData();
            myforf.datastack.push(~~func(a)); // truncate, FIXME
        };
    };
    var binfunc = function(func) {
        return function(myforf) {
            var a = myforf.popData();
            var b = myforf.popData();
            myforf.datastack.push(~~func(b,a)); // truncate?, FIXME
        };
    };
    this.builtins["~"] = unfunc(function(a) { return ~a; });
    this.builtins["!"] = unfunc(function(a) { return !a; });
    this.builtins["+"] = binfunc(function(a, b) { return a+b; });
    this.builtins["-"] = binfunc(function(a, b) { return a-b; });
    this.builtins["/"] = binfunc(function(a, b) {
        if (b === 0) { throw "division by zero"; }
        return a/b;
    });
    this.builtins["%"] = binfunc(function(a, b) {
        if (b === 0) { throw "division by zero"; }
        return mod(a,b);
    });
    this.builtins["*"] = binfunc(function(a, b) { return a*b; });
    this.builtins["&"] = binfunc(function(a, b) { return a&b; });
    this.builtins["|"] = binfunc(function(a, b) { return a|b; });
    this.builtins["^"] = binfunc(function(a, b) { return a^b; });
    this.builtins["<<"] = binfunc(function(a, b) { return a<<b; });
    this.builtins[">>"] = binfunc(function(a, b) { return a>>b; });
    this.builtins[">"] = binfunc(function(a, b) { return a>b; });
    this.builtins[">="] = binfunc(function(a, b) { return a>=b; });
    this.builtins["<"] = binfunc(function(a, b) { return a<b; });
    this.builtins["<="] = binfunc(function(a, b) { return a<=b; });
    this.builtins["="] = binfunc(function(a, b) { return a===b; });
    this.builtins["<>"] = binfunc(function(a, b) { return a!==b; });
    this.builtins["abs"] = unfunc(function(a) { return Math.abs(a); });
    // FIXME: the three following functions can only manipulate numbers in cforf
    this.builtins["dup"] = function(myforf) {
        var val = myforf.popData();
        myforf.datastack.push(val);
        myforf.datastack.push(val);
    };
    this.builtins["pop"] = function(myforf) {
        myforf.popData();
    };
    this.builtins["exch"] = function(myforf) {
       var a = myforf.popData();
       var b = myforf.popData();
       myforf.datastack.push(a);
       myforf.datastack.push(b);
    };
    this.builtins["if"] = function(myforf) {
       var ifclause = myforf.popData();
       var cond = myforf.popData();
       if (cond) {
            // TODO: make sure ifclause is a list
            for (var i = 0; i < ifclause.length; i++) {
                myforf.cmdstack.push(ifclause[i]);
            }
        }
    };
    this.builtins["ifelse"] = function(myforf) {
        var elseclause = myforf.popData();
        var ifclause = myforf.popData();
        var cond = myforf.popData();
        if (!cond) {
            ifclause = elseclause;
        }
        // TODO: make sure ifclause is a list
        for (var i = 0; i < ifclause.length; i++) {
            myforf.cmdstack.push(ifclause[i]);
        }
    };
    this.builtins["mset"] = function(myforf) {
        var pos = myforf.popData();
        var a = myforf.popData();
        if (pos < 0 || pos >= MEMORY_SIZE) {
            throw "invalid memory location";
        }
        myforf.mem[pos] = a;
    };
    this.builtins["mget"] = function(myforf) {
        var pos = myforf.popData();
        if (pos < 0 || pos >= MEMORY_SIZE) {
            throw "invalid memory location";
        }
        myforf.datastack.push(myforf.mem[pos]);
    };
};

Forf.prototype.popData = function() {
    if (this.datastack.length === 0) {
        throw "tried to pop from empty stack";
    }
    return this.datastack.pop();
};

Forf.prototype.init = function(code) {
    this.code = code;
};

Forf.prototype.parse = function() {
    this.cmdstack = [];

    // 'parse' the input
    this.code = this.code.replace(/\([^)]*\)/g, "");
    var splitCode = this.code.split(/([{}])/).join(" ");
    var tokens = splitCode.split(/\s+/).filter(Boolean); // filter to deal with newlines etc
    // FIXME: this is a hack right now because ugh stacks
    var parseTokensAt = function(i, stack) {
        var val = tokens[i];
        if (val === "{") {
            var dststack = [];
            i = i + 1;
            while (i < tokens.length) {
                if (tokens[i] === "}") {
                    break;
                }
                i = parseTokensAt(i, dststack);
            }
            stack.push(dststack.reverse());
        } else {
            // replace numbers with actual numbers
            var n = parseInt(val);
            if (String(n) === val) {
                stack.push(n);
            } else {
                stack.push(val);
            }
        }
        return i + 1;
    };
    var i = 0;
    while (i < tokens.length) {
        i = parseTokensAt(i, this.cmdstack);
    }

    // The first thing we read should be the first thing we do.
    this.cmdstack = this.cmdstack.reverse();
};

Forf.prototype.run = function() {
    this.datastack = [];

    var running = true;
    while (running && this.cmdstack.length) {
        var val = this.cmdstack.pop();
        if (typeof(val) == "string") {
            var func = this.builtins[val];
            if (val in this.builtins) {
                func(this);
            } else {
                throw "no such function '" + val + "'";
            }
        } else {
            this.datastack.push(val);
        }
    }
};

var ForfTank = function() {
	/* pick a random id for this tank for scoring purposes.
	 * the C code uses the pointer to the forftank, but I don't think
	 * an easy analogue exists in Javascript.
	 **/
	this.tankid = Math.floor(Math.random() * Math.pow(2,64));

    // http://www.paulirish.com/2009/random-hex-color-code-snippets/
    this.color = '#'+(4473924+Math.floor(Math.random()*12303291)).toString(16);
    this.radius = TANK_RADIUS;
    this.type = ObjectType.TANK;
    this.sensors = [];
    this.position = [0, 0];
    this.nextPosition = [0, 0];
    this.angle = 0;
    this.speed = new Object;
    this.speed.desired = [0, 0];
    this.speed.current = [0, 0];
    this.turret = new Object;
    this.turret.current = 0;
    this.turret.desired = 0;
    this.turret.firing = 0;
    this.turret.recharge = 0;
	this.teleport_recharge = 0;
	this.teleporting = 0;
    this.led = 0;
    this.killer = null;
    this.cause_death = "(null)";
	this.path = "";
	this.error = "None";
	this.error_pos = 0;
	this.name = "Unnamed";
	this.ammo = TANK_AMMO; /* starting ammo */

    this.builtins["fire-ready?"] = function(myforf) {
        myforf.datastack.push(myforf.fireReady());
    };


    this.builtins["fire!"] = function(myforf) {
        myforf.fire();
    };

	if (TANK_ENABLE_TELEPORT) {    

	    this.builtins["teleport-ready?"] = function(myforf) {
	        myforf.datastack.push(myforf.teleportReady());
	    };

		this.builtins["teleport!"] = function(myforf) {
	        myforf.teleport();
	    };
	}

    this.builtins["set-speed!"] = function(myforf) {
        var right = myforf.popData();
        var left = myforf.popData();
        myforf.setSpeed(left, right);
    };
    this.builtins["set-turret!"] = function(myforf) {
        var angle = myforf.popData();
        myforf.setTurret(deg2rad(angle));
    };
    this.builtins["get-turret"] = function(myforf) {
        var angle = myforf.getTurret();
        myforf.datastack.push(rad2deg(angle));
    };
    this.builtins["sensor?"] = function(myforf) {
        var sensor_num = myforf.popData();
        myforf.datastack.push(myforf.getSensor(sensor_num));
    };
    this.builtins["set-led!"] = function(myforf) {
        var active = myforf.popData();
        myforf.setLed(active);
    };
    this.builtins["random"] = function(myforf) {
        var max = myforf.popData();
        if (max < 1) {
             myforf.datastack.push(0);
             return;
        }
        myforf.datastack.push(Math.floor(Math.random() * max));
    };
};

ForfTank.prototype = new Forf();
ForfTank.prototype.constructor = ForfTank;

ForfTank.prototype.addSensor = function(range, angle, width, turret) {
    var sensor = new Object();
    sensor.range = range;
    sensor.angle = deg2rad(angle);
    sensor.width = deg2rad(width);
    sensor.turret = turret;
    this.sensors.push(sensor);

};

ForfTank.prototype.fireReady = function() {
	if (this.ammo > 0 || this.ammo < 0) { /* if ammo is negative it's unlimited */
	    return !this.turret.recharge;
	} else {
		return 0;
	}
};

ForfTank.prototype.fire = function() {

	var res = false;

    var can_fire = this.fireReady();
	if (can_fire) {
		res = true;
		this.ammo = this.ammo - 1; /* only if we can fire do we dec ammo */
	}

	this.turret.firing = res;
};

ForfTank.prototype.teleportReady = function() {
    return !this.teleport_recharge;
};

ForfTank.prototype.teleport = function() {
    this.teleporting = this.teleportReady();
};

ForfTank.prototype.setSpeed = function(left, right) {
    this.speed.desired[0] = Math.min(Math.max(left, -100), 100);
    this.speed.desired[1] = Math.min(Math.max(right, -100), 100);
};

ForfTank.prototype.getTurret = function() {
    return this.turret.current;
};

ForfTank.prototype.setTurret = function(angle) {
    this.turret.desired = mod(angle, TAU);
};

ForfTank.prototype.getSensor = function(sensor_num) {
    if ((sensor_num < 0) || (sensor_num >= this.sensors.length)) {
        return 0;
    } else {
        return this.sensors[sensor_num].triggered;
    }
};

ForfTank.prototype.setLed = function(active) {
    this.led = active;
};

ForfTank.prototype.move = function() {
    this.position[0] = this.nextPosition[0];
    this.position[1] = this.nextPosition[1];
};

ForfTank.prototype.precalcNextPosition = function() {
    var dir = 1;
    var movement;
    var angle;

    /* Rotate the turret */
    var rot_angle;              /* Quickest way there */

    /* Constrain rot_angle to between -PI and PI */
    rot_angle = this.turret.desired - this.turret.current;
    while (rot_angle < 0) {
      rot_angle += TAU;
    }
    rot_angle = mod(Math.PI + rot_angle, TAU) - Math.PI;

    rot_angle = Math.min(TANK_MAX_TURRET_ROT, rot_angle);
    rot_angle = Math.max(-TANK_MAX_TURRET_ROT, rot_angle);
    this.turret.current = mod(this.turret.current + rot_angle, TAU);

    /* Fakey acceleration */
    for (var i = 0; i < 2; i++) {
      if (this.speed.current[i] === this.speed.desired[i]) {
        /* Do nothing */
      } else if (this.speed.current[i] < this.speed.desired[i]) {
        this.speed.current[i] = Math.min(this.speed.current[i] + TANK_MAX_ACCEL,
                                         this.speed.desired[i]);
      } else {
        this.speed.current[i] = Math.max(this.speed.current[i] - TANK_MAX_ACCEL,
                                         this.speed.desired[i]);
      }
    }

    /* The simple case */
    if (this.speed.current[0] === this.speed.current[1]) {
        movement = this.speed.current[0] * (TANK_TOP_SPEED / 100.0);
        angle = 0;
    } else {
        /* pflarr's original comment:
         *
         *   The tank drives around in a circle of radius r, which is some
         *   offset on a line perpendicular to the tank.  The distance it
         *   travels around the circle varies with the speed of each tread,
         *   and is such that each side of the tank moves an equal angle
         *   around the circle.
         *
         * Sounds good to me.   pflarr's calculations here are fantastico,
         * there's nothing whatsoever to change. */

        /* The first thing Paul's code does is find "friction", which seems
           to be a penalty for having the treads go in opposite directions.
           This probably plays hell with precisely-planned tanks, which I
           find very ha ha. */
        var friction = TANK_FRICTION * (Math.abs(this.speed.current[0] - this.speed.current[1]) / 200);
        var v = [0, 0];
        v[0] = this.speed.current[0] * (1 - friction) * (TANK_TOP_SPEED / 100.0);
        v[1] = this.speed.current[1] * (1 - friction) * (TANK_TOP_SPEED / 100.0);

        var Si;
        var So;
        /* Outside and inside speeds */
        if (Math.abs(v[0]) > Math.abs(v[1])) {
            Si = v[1];
            So = v[0];
            dir = 1;
        } else {
            Si = v[0];
            So = v[1];
            dir = -1;
        }

        /* Radius of circle to outside tread (use similar triangles) */
        this.movementRadius = So * (TANK_RADIUS * 2) / (So - Si);

        /* pflarr:

           The fraction of the circle traveled is equal to the speed
           of the outer tread over the circumference of the circle:
               Ft = So/(tau*r)
           The angle traveled is:
               theta = Ft * tau
           This reduces to a simple
               theta = So/r
           We multiply it by dir to adjust for the direction of rotation
        */
        var theta = So/this.movementRadius * dir;

        movement = this.movementRadius * Math.tan(theta);
        angle = theta;
    }

    /* Now move the tank */
    this.angle = mod(this.angle + angle + TAU, TAU);
    var m = [0, 0];

    m[0] = Math.cos(this.angle) * movement * dir;
    m[1] = Math.sin(this.angle) * movement * dir;

    for (var i = 0; i < 2; i++) {
        this.nextPosition[i] = mod(this.position[i] + m[i] + gameSize[i], gameSize[i]);
    }
};

ForfTank.prototype.initObj = function(canvas, ctx) {
    this.precalcNextPosition();
};

var Pillar = function(ctx, radius, color) {
    this.position = [0, 0];
    this.radius = radius;
    this.type = ObjectType.PILLAR; 
    this.ctx = ctx;
    this.color = color;
};

Pillar.prototype.draw = function() {
    this.ctx.save();
    this.ctx.fillStyle = "#FF0000";
    this.ctx.beginPath();
    this.ctx.arc(this.position[0], this.position[1], this.radius, 0, 2*Math.PI);
    this.ctx.closePath();
    this.ctx.stroke();
    this.ctx.fill();
    this.ctx.restore();  
};

Pillar.prototype.initObj = function(canvas, ctx) {
    this.ctx = ctx;
};

var normalizeRad = function(r) { return (r % TAU) > 0 ? (r % TAU) : (r + TAU); };

Pillar.prototype.collision = function(tank) {
    /* Check if there will be a collision */
    if ((sq(tank.nextPosition[0] - this.position[0]) +
         sq(tank.nextPosition[1] - this.position[1])) <=
        sq(tank.radius + this.radius)) {
      /* If the tank collided with us last turn, then it didn't bother to turn away from us. */
      if (tank.collided) {
        tank.nextPosition[0] = tank.position[0];
        tank.nextPosition[1] = tank.position[1];
        return;
      }
      /* Tank will collide with us. Start the long and arduous process of closing the gap between
         the tank and the pillar for the sake of accuracy. */
      /* First, the "easy" case. */
      /* http://math.stackexchange.com/questions/228841/how-do-i-calculate-the-intersections-of-a-straight-line-and-a-circle */
      if (tank.speed.current[0] === tank.speed.current[1]) {
        /* Find the line y = mx + c that the tank is moving along */
        var m = Math.tan(tank.angle);
        /* Javascript has some wonky behaviors when dealing with numbers > 10^15. Since
           m ends up being cubed in the calculation for the discriminant, we treat any slopes >
           100000 as being vertical lines. */
        if (Math.abs(m) > 100000) { 
          tank.nextPosition[0] = tank.position[0];
          if (tank.position[1] > this.position[1]) {
            /* Tank is below pillar (graphically speaking) */
            tank.nextPosition[1] = this.position[1] + Math.sqrt(sq(this.radius + tank.radius) - sq(tank.position[0] - this.position[0]));
          }
          else {
          /* Tank is above pillar (graphically speaking) */
            tank.nextPosition[1] = this.position[1] - Math.sqrt(sq(this.radius + tank.radius) - sq(tank.position[0] - this.position[0]));
          }
          tank.collided = 1;
          return;
        }
        var c = tank.position[1] - m * tank.position[0]; // c = y - mx
        /* Plugging in the line to the equation of the movement circle yields a quadratic equation
           Ax^2 + Bx + C = 0 that can be solved. */
        var A = sq(m) + 1;
        var B = 2*(m*c - m*this.position[1] - this.position[0]);
        var C = sq(this.position[1]) - sq(this.radius + tank.radius) + sq(this.position[0]) - 2*c*this.position[1] + sq(c);
        var discriminant;
        discriminant = sq(B) - 4*A*C;
        if (discriminant === 0) {
          tank.nextPosition[0] = -B / (2*A);
          tank.nextPosition[1] = m * tank.nextPosition[0] + c;
          tank.collided = 1;
        }
        else if (discriminant > 0) {
//          console.log("Collision.");
          /* We will have two possible values for x. Pick the one that is closest to the tank. */
          var x1 = (-B + Math.sqrt(discriminant))/(2*A);
          var x2 = (-B - Math.sqrt(discriminant))/(2*A);
          if (Math.abs(x1 - tank.position[0]) < Math.abs(x2 - tank.position[0]))
            tank.nextPosition[0] = x1;
          else
            tank.nextPosition[0] = x2;

          tank.nextPosition[1] = m * tank.nextPosition[0] + c;
          tank.collided = 1;
          return;
        }
        else {
          /* Something weird happened. If we calculated that the distance between this pillar and the tank
             is less than the sum of their radii, then we should have a collision and the discriminant shouldn't
             be less than 0. */
          console.log("Discriminant less than 0. Shouldn't happen.");
          tank.collided = 0;
          return;
        }
      }
      else {
        /* As pflarr said, the tank moves along a circle, so we need to find the point on
           this circle where the pillar and the tank are both touching. To start, we find the center
           point of the tank's circle of movement and translate the rest of the points used in the calculation
           such that the center of the circle is the origin. */
        /* First calculate the vector of the tanks movement, rotate it 90 degrees (so that it
           points inward to the circle), and add the vector to the tank's current position. This yields 
           the center of the movement circle. */
        var center;
        var tankVector = [Math.cos(tank.angle)*tank.movementRadius, Math.sin(tank.angle)*tank.movementRadius];
        var rotatedVector;
        if (tank.speed.current[0] < tank.speed.current[1]) { // Rotate left
          rotatedVector = [tankVector[1], -1*tankVector[0]];
        }
        else { // Rotate right
          rotatedVector = [-1*tankVector[1], tankVector[0]];
        }
        center = [tank.position[0] + rotatedVector[0], tank.position[1] + rotatedVector[1]];
        var translatedPillarPos = [this.position[0] - center[0], this.position[1] - center[1]];
        var rPillar = Math.sqrt(sq(translatedPillarPos[0]) + sq(translatedPillarPos[1]));
        var tPillar, tTank;
        /* arctan is only defined for values -PI/2 < theta < PI/2 (ie. the first and fourth quadrants).
           This means if the translated x position is less than 0, we have to add PI. */
        if (translatedPillarPos[0] < 0) {
          tPillar = Math.atan((translatedPillarPos[1]/translatedPillarPos[0])) + Math.PI;
        }
        else {
          tPillar = Math.atan((translatedPillarPos[1]/translatedPillarPos[0]));
        }
        tPillar = normalizeRad(tPillar);

        if (tank.position[0] < center[0]) {
          tTank = Math.atan((tank.position[1] - center[1])/(tank.position[0] - center[0])) + Math.PI;
        }
        else {
          tTank = Math.atan((tank.position[1] - center[1])/(tank.position[0] - center[0]));
        }
        tTank = normalizeRad(tTank);

        var dT = Math.acos(-1*((sq(this.radius + tank.radius) - sq(rPillar) - sq(tank.movementRadius))/
                           (2*rPillar*tank.movementRadius)));
        var newTTank, theta1, theta2;
        if (isNaN(dT)) {
          newTTank = tPillar;
//          console.log("dT was NaN");
        }
        else { //Need to make sure thetas are normalized
          theta1 = tPillar - dT;
          theta2 = tPillar + dT;
          theta1 = normalizeRad(theta1);
          theta2 = normalizeRad(theta2);
	  var dist1 = Math.abs(tTank - theta1);
	  dist1 = dist1 > Math.PI ? TAU - dist1 : dist1;
	  var dist2 = Math.abs(tTank - theta2);
	  dist2 = dist2 > Math.PI ? TAU - dist2 : dist2;
          if (dist1 < dist2)
            newTTank = theta1;
          else
            newTTank = theta2;
        }

        tank.nextPosition[0] = Math.cos(newTTank) * tank.movementRadius + center[0];
        tank.nextPosition[1] = Math.sin(newTTank) * tank.movementRadius + center[1];
        /* Debugging code. Checks if we moved farther than a tank is supposed to be able to in one turn. */ 
        if ((sq(tank.position[0] - tank.nextPosition[0]) + sq(tank.position[1] - tank.nextPosition[1])) >= 
            sq(TANK_TOP_SPEED)) {
          console.log("Pillar pos: " + this.position);
          console.log("Tank pos: " + tank.position);
	  console.log("Tank nextpos: " + tank.nextPosition);
          console.log("Tank angle: " + tank.angle);
          console.log("Tank speed: " + tank.speed.current);
          console.log("Center: " + center);
          console.log("Mov. Circ. R: " + tank.movementRadius);
          console.log("tPillar: " + tPillar);
          console.log("tTank: " + tTank);
          console.log("dT: " + dT);
          console.log("thetas: " + theta1 + ", " + theta2);
          console.log("----------------------------------");
        }
        tank.collided = 1;
        return;
      }
    }
    else {
      /* No collision. */
      tank.collided = 0;
      return;
    }
};

var drawingTanks = [];
var objs = []; // Everything on the board
var tanks = []; // objects that are tanks
var obstacles = []; // objects that are obstacles
var gameSize = [0, 0];
var interval = null;
var us = null;

var initTanks = function(tanks) {
    var ntanks = tanks.length;

    // Calculate the size of the game board.
    var x = 1; 
    while (x * x < ntanks) {
        x = x + 1; 
    }    
    var y = Math.floor(ntanks / x);
    if (ntanks % x) { 
        y = y + 1; 
    }    
    gameSize[0] = x * SPACING;
    gameSize[1] = y * SPACING;

    // Shuffle the order we place things on the game board.
    var order = [];
    for (var i = 0; i < ntanks; i++) {
        order.push(i);
    }    

    for (var i = 0; i < ntanks; i++) {
        var j = Math.floor(Math.random() * ntanks);
        var n = order[j];
        order[j] = order[i];
        order[i] = n; 
    }    


    // Position tanks.
    x = SPACING / 2; 
    y = SPACING / 2; 
    for (var i = 0; i < ntanks; i++) {
        tanks[order[i]].position[0] = x; 
        tanks[order[i]].position[1] = y; 
		rhinout("tank #" + i + " is at " + x + "x" + y);
        // TODO: Move to constructor?
        tanks[order[i]].angle = Math.random() * TAU; 
        tanks[order[i]].turret.current = Math.random() * TAU; 
        tanks[order[i]].turret.desired = tanks[order[i]].turret.current;

        x = x + SPACING;
        if (x > gameSize[0]) {
            x = x % gameSize[0];
            y = y + SPACING;
        }
    }    
};


var rotate_point = function(angle, point) {
    var cos_ = Math.cos(angle);
    var sin_ = Math.sin(angle);

    var newp = [0, 0];
    newp[0] = point[0]*cos_ - point[1]*sin_;
    newp[1] = point[0]*sin_ + point[1]*cos_;

    point[0] = newp[0];
    point[1] = newp[1];
};


ForfTank.prototype.fireCannon = function(that, vector, dist2) {
    /* If someone's a crater, this is easy */
    if ((this.killer && this.killer !== that) || that.killer) {
        return;
    }

    /* Did they collide? */
    if ((!this.killer) && dist2 < TANK_COLLISION_ADJ2) {
        this.killer = that.tankid;
        this.cause_death = "collision";

        that.killer = this.tankid;
        that.cause_death = "collision";

        return;
    }

    /* No need to check if it's not even firing */
    if (!this.turret.firing) {
        return;
    }

    /* Also no need to check if it's outside cannon range */
    if (dist2 > TANK_CANNON_ADJ2) {
        return;
    }

    var theta = this.angle + this.turret.current;

    /* Did this shoot that?  Rotate point by turret degrees, and if |y| <
       TANK_RADIUS, we have a hit. */
    var rpos = [vector[0], vector[1]];
    rotate_point(-theta, rpos);
    if ((rpos[0] > 0) && (Math.abs(rpos[1]) < TANK_RADIUS)) {
        that.killer = this.tankid;
        that.cause_death = "shot";
    }
};

ForfTank.prototype.teleportTank = function() {


    /* return if we're not teleporting */
    if (this.killer || ! this.teleporting) {

        return;
    }

    /* teleport the tank -- assign a random new x,y coords */
    this.position[0] = Math.floor(Math.random() * gameSize[0]);
    this.position[1] = Math.floor(Math.random() * gameSize[1]);

};




ForfTank.prototype.sensorCalc = function(that, vector, dist2) {

    /* If someone's a crater, this is easy */
    if (this.killer || that.killer) {
        return;
    }

    /* If they're not inside the max sensor, just skip it */
    if (dist2 > sq(TANK_SENSOR_RANGE + that.radius)) {
        return;
    }

    /* Calculate sensors */
    for (var i = 0; i < this.sensors.length; i++) {
        if (0 === this.sensors[i].range) {
            /* Sensor doesn't exist */
            continue;
        }

        /* No need to re-check this sensor if it's already firing */
        if (this.sensors[i].triggered & that.type) {
            continue;
        }

        /* If the tank is out of range, don't bother */
        if (dist2 > sq(this.sensors[i].range + that.radius)) {
            continue;
        }

        /* What is the angle of our sensor? */
        var theta = this.angle + this.sensors[i].angle;
        if (this.sensors[i].turret) {
            theta += this.turret.current;
        }

        /* Rotate their position by theta */
        var rpos = [vector[0], vector[1]];
        rotate_point(-theta, rpos);

        /* Sensor is symmetrical, we can consider only top quadrants */
        rpos[1] = Math.abs(rpos[1]);

        /* Compute inverse slopes to tank and of our sensor */
        var m_s = 1 / Math.tan(this.sensors[i].width / 2);

        var m_r = rpos[0] / rpos[1];

        /* If our inverse slope is less than theirs, they're inside the arc */
        if (m_r >= m_s) {
            this.sensors[i].triggered |= that.type;
            continue;
        }

        /* Now check if the edge of the arc intersects the tank.  Do this
           just like with firing. */
        rotate_point(this.sensors[i].width / -2, rpos);
        if ((rpos[0] > 0) && (Math.abs(rpos[1]) < that.radius)) {
            this.sensors[i].triggered |= that.type;
        }
    }
};

var compute_vector = function(vector, _this, that) {
    /* Establish shortest vector from center of this to center of that,
     * taking wrapping into account */
    for (var i = 0; i < 2; i += 1) {
        var halfsize = gameSize[i] / 2;

        vector[i] = that.position[i] - _this.position[i];
        if (vector[i] > halfsize) {
            vector[i] = vector[i] - gameSize[i];
        } else if (vector[i] < -halfsize) {
            vector[i] = gameSize[i] + vector[i];
        }
    }

    /* Compute distance^2 for range comparisons */
    return sq(vector[0]) + sq(vector[1]);
};

var updateTanks = function(tanks, mode) {

	/* mode determines whether we are in a browser or in rhino */

    /* Charge cannons and reset sensors */
    for (var i = 0; i < tanks.length; i++) {
        if (tanks[i].turret.firing) {
            tanks[i].turret.firing = 0;
            tanks[i].turret.recharge = TANK_CANNON_RECHARGE;
        }
        if (tanks[i].teleporting) {
            tanks[i].teleporting = 0;
            tanks[i].teleport_recharge = TANK_TELEPORT_RECHARGE;
        }
        if (tanks[i].killer) {
            continue;
        }
        if (tanks[i].turret.recharge) {
            tanks[i].turret.recharge -= 1;
        }
        /* recharge teleport if necessary */
        if (tanks[i].teleport_recharge) {
            tanks[i].teleport_recharge -= 1;
        }

	/* Reset all sensors to 0 */
        for (var j = 0; j < tanks[i].sensors.length; j += 1) {
          tanks[i].sensors[j].triggered = 0;
       }
    }

    /* Move tanks */
    for (var i = 0; i < tanks.length; i++) {
        if (tanks[i].killer) {
            continue;
        }
        tanks[i].move();
    }

    /* Probe sensors */
    for (var i = 0; i < tanks.length; i++) {
        if (tanks[i].killer) {
            continue;
        }
        for (var j = i + 1; j < tanks.length; j += 1) {
            var _this = tanks[i];
            var that = tanks[j];

            var vector = [0, 0];
            var dist2 = compute_vector(vector, _this, that);
            _this.sensorCalc(that, vector, dist2);
            vector[0] = -vector[0];
            vector[1] = -vector[1];
            that.sensorCalc(_this, vector, dist2);
        }
	for (var j = 0; j < obstacles.length; j++) {
	    var _this = tanks[i];
	    var that = obstacles[j];
	    var vector = [0, 0];
	    var dist2 = compute_vector(vector, _this, that);
	    _this.sensorCalc(that, vector, dist2); 
        }
    }

    /* Run programs */
	var errors = [];
    for (var i = 0; i < tanks.length; i++) {
        if (tanks[i].killer) {
            continue;
        }
        try {
            tanks[i].parse(tanks[i].code);
            tanks[i].run();
        } catch (e) {
            tanks[i].error = e;
			errors.push(e);
        }
    }
	
	/* only print errors if we're in a browser.
	   if we are in rhino, errors will be included in an array
	   'standings' similar to ctanks and used with rank.awk
	   to generate output.
	   */
	if (mode == "browser" && errors.length) {
		
			if (interval) {
				clearInterval(interval);
			}

			document.getElementById('debug').innerHTML = "Error: " + errors.join();
			return;

	}

    /* Fire cannons, teleport and check for crashes */
    for (var i = 0; i < tanks.length; i++) {

        if (tanks[i].killer) {
            continue;
        }

	tanks[i].teleportTank();
        var _this = tanks[i];
        for (var j = i + 1; j < tanks.length; j += 1) {
            var that = tanks[j];

            var vector = [0, 0];
            var dist2 = compute_vector(vector, _this, that);
            _this.fireCannon(that, vector, dist2);
            vector[0] = -vector[0];
            vector[1] = -vector[1];
            that.fireCannon(_this, vector, dist2);
        }

	_this.precalcNextPosition();
	for (var j = 0; j < obstacles.length; j++) {
      	    obstacles[j].collision(_this);
        }
    }
};

var addBerzerker = function() {
    var tank = new ForfTank();
    tank.init("2 random 0 = { 50 100 set-speed! } { 100 50 set-speed! } ifelse  4 random 0 = { 360 random  set-turret! } if  30 random 0 = { fire! } if");
    tank.path = "NA";
    tank.name = "Berzerker";
    tanks.push(tank);
    objs.push(tank);
};

var raisePillar = function() {
    var radius = PILLAR_MIN_RAD + Math.floor(Math.random()*(PILLAR_MAX_RAD - PILLAR_MIN_RAD));
    var color = '#'+(4473924+Math.floor(Math.random()*12303291)).toString(16);
    var pillar = new Pillar(null, radius, color);
    obstacles.push(pillar);
    objs.push(pillar);
};

var getSpacing = function(type1, type2) {
  if (type1 === type2)
    return spacing[type1];
  else
    return spacing[type1 + type2];
};

var initBoard = function() {
  var placedCircles = [];
  var nobjects = objs.length;
  var x = 1;
  while (x * x < nobjects) {
    x = x + 1;
  }
  var y = Math.floor(nobjects / x);
  if (nobjects % x) {
    y = y + 1;
  }
  gameSize[0] = x * SPACING;
  gameSize[1] = y * SPACING;

  // Place pillars first since they have a constraint
  for (var i = 0; i < obstacles.length;) {
    x = PILLAR_TO_WALL + Math.floor(Math.random() * (gameSize[0] - 2*PILLAR_TO_WALL));
    y = PILLAR_TO_WALL + Math.floor(Math.random() * (gameSize[1] - 2*PILLAR_TO_WALL));
    var overlaps = false;
    for (var j = 0; j < placedCircles.length; j++) {
      if ((sq(placedCircles[j].x - x) +
           sq(placedCircles[j].y - y)) <=
           sq(placedCircles[j].radius + obstacles[i].radius + 
           getSpacing(placedCircles[j].type, obstacles[i].type))) {
        overlaps = true;
        break;
      }
    }
    if (overlaps) {
      continue;
    }
    else {
      obstacles[i].position[0] = x;
      obstacles[i].position[1] = y;
      placedCircles[i] = {x: x, y: y, radius: obstacles[i].radius, type: obstacles[i].type};
      i++;
    }
  } 
 
  // Place tanks
  for (var i = 0; i < tanks.length;) {
    x = Math.floor(Math.random() * gameSize[0]);
    y = Math.floor(Math.random() * gameSize[1]);
    var overlaps = false;
    for (var j = 0; j < placedCircles.length; j++) {
      if ((sq(placedCircles[j].x - x) +
           sq(placedCircles[j].y - y)) <=
           sq(placedCircles[j].radius + tanks[i].radius + 
           getSpacing(placedCircles[j].type, tanks[i].type))) {
        overlaps = true;
        break;
      }
    }
    if (overlaps) {
      continue;
    }
    else {
      tanks[i].position[0] = x;
      tanks[i].position[1] = y;
      placedCircles[i] = {x: x, y: y, radius: tanks[i].radius, type: tanks[i].type};
      i++;
    }
  }
};

var addTweedledum = function() {
    var tank = new ForfTank();
    tank.init("get-turret 12 + set-turret! 60 50 set-speed! 0 sensor? { fire! } if 1 sensor? { -50 50 set-speed! } if"); 
	tank.path = "NA";
	tank.name = "Tweedledum";
    tank.addSensor(50, 0, 7, 1);
    tank.addSensor(50, 0, 90, 0);
    tank.addSensor(0, 0, 0, 0);
    tank.addSensor(0, 0, 0, 0);
    tank.addSensor(0, 0, 0, 0);
    tank.addSensor(0, 0, 0, 0);
    tank.addSensor(0, 0, 0, 0);
    tank.addSensor(0, 0, 0, 0);
    tank.addSensor(0, 0, 0, 0);
    tank.addSensor(0, 0, 0, 0);
    tanks.push(tank);
};

var addTweedledummer = function() {
    var tank = new ForfTank();
    tank.init("get-turret 12 + set-turret! -80 -70 set-speed! 0 sensor? { fire! } if 1 sensor? { -50 50 set-speed! } if"); 
	tank.path = "NA";
	tank.name = "Tweedledummer";
    tank.addSensor(50, 0, 7, 1);
    tank.addSensor(50, 0, 90, 0);
    tank.addSensor(0, 0, 0, 0);
    tank.addSensor(0, 0, 0, 0);
    tank.addSensor(0, 0, 0, 0);
    tank.addSensor(0, 0, 0, 0);
    tank.addSensor(0, 0, 0, 0);
    tank.addSensor(0, 0, 0, 0);
    tank.addSensor(0, 0, 0, 0);
    tank.addSensor(0, 0, 0, 0);
    tanks.push(tank);
};

var addTweedledummerer = function() {
    var tank = new ForfTank();
    tank.init("get-turret 12 + set-turret! 20 30 set-speed! 0 sensor? { fire! } if 1 sensor? { -50 50 set-speed! } if"); 
	tank.path = "NA";
	tank.name = "Tweedledummer";
    tank.addSensor(50, 0, 7, 1);
    tank.addSensor(50, 0, 90, 0);
    tank.addSensor(0, 0, 0, 0);
    tank.addSensor(0, 0, 0, 0);
    tank.addSensor(0, 0, 0, 0);
    tank.addSensor(0, 0, 0, 0);
    tank.addSensor(0, 0, 0, 0);
    tank.addSensor(0, 0, 0, 0);
    tank.addSensor(0, 0, 0, 0);
    tank.addSensor(0, 0, 0, 0);
    tanks.push(tank);
};


var addTweedledummerest = function() {
    var tank = new ForfTank();
    tank.init("get-turret 12 + set-turret! 40 35 set-speed! 0 sensor? { fire! } if 1 sensor? { -50 50 set-speed! } if"); 
	tank.path = "NA";
	tank.name = "Tweedledummerest";
    tank.addSensor(50, 0, 7, 1);
    tank.addSensor(50, 0, 90, 0);
    tanks.push(tank);
};

var truncateProgram = function(code, length) {


	var CountedChars = 0;
	var i = 0; 
	var TruncCode = '';
	for (i; i < code.length; i++) {
		if (code.charAt(i) != ' ' &&
			code.charAt(i) != '\t' &&
			code.charAt(i) != '\n') {

				CountedChars++;
				
				if (CountedChars >= length) {
					/* quit if we reach max length */
					rhinout("We hit max length!");
					break;
				} 

			}
			TruncCode += code.charAt(i);
	}
	
	rhinout("CountedChars: " + CountedChars);

	return TruncCode;

}

var resetTanks = function() {
    if (interval) {
        clearInterval(interval);
    }

    document.getElementById('debug').innerHTML = "&nbsp;";

    tanks = [];
    drawingTanks = [];
    objs = [];
    us = null;
    obstacles = [];
    var tank;
    
    // add the user's tank
    tank = new ForfTank();
    tank.color = document.getElementsByName('color')[0].value;
    tank.name = document.getElementsByName('name')[0].value;
    for (var i = 0; i < TANK_MAX_SENSORS; i++) {
        var range = 1*document.getElementsByName('s'+i+'r')[0].value;
        var angle = (1*document.getElementsByName('s'+i+'a')[0].value) % 360;
        var width = (1*document.getElementsByName('s'+i+'w')[0].value) % 360;
        var turret = 1*document.getElementsByName('s'+i+'t')[0].checked;
        if (range) {
//	    console.log("range: " + range + ", angle: " + angle + ", width: " + width + ", turret: " + turret);
            tank.addSensor(range, angle, width, turret);
        }
    }
    var code = document.getElementById('program').value;
    if (TANK_MAX_PROGRAM_LENGTH > 0) {
	code = truncateProgram(code, TANK_MAX_PROGRAM_LENGTH);
    }
    tank.init(code);
    tanks.push(tank);
    objs.push(tank);
    us = tank;

    var n = 6 + Math.floor(Math.random()*3);
    for (var i = 0; i < n; i++) {
        addBerzerker();
    }
    n = 1 + Math.floor(Math.random()*3);
    for (var i = 0; i < n; i++) {
       raisePillar();
    }
    initBoard(); 
    var canvas = document.getElementById('battlefield');
    canvas.width = gameSize[0];
    canvas.height = gameSize[1];

    var canvas = document.getElementById('battlefield');
    var ctx = canvas.getContext('2d');
    for (var i = 0; i < tanks.length; i++) {
        var sensors = [];
        for (var j = 0; j < tanks[i].sensors.length; j++) {
            var s = tanks[i].sensors[j];
            var sensor = [s.range, s.angle, s.width, s.turret];
            sensors.push(sensor);
        }
        tank = new Tank(ctx, canvas.width, canvas.height, tanks[i].color, sensors);
        drawingTanks.push(tank);
    }
    for (var i = 0; i < objs.length; i++) {
	objs[i].initObj(canvas, ctx);
    }

    function update() {
        updateTanks(tanks, "browser");

        // clear
        canvas.width = canvas.width;

        var activeTanks = 0;
        for (var i = 0; i < tanks.length; i++) {
            var flags = 0;
            if (tanks[i].turret.firing) {
                flags |= 1;
            }
            if (tanks[i].led) {
                flags |= 2;
            }
            if (tanks[i].teleporting) {
                flags |= 8;
            }
            if (tanks[i].killer) {
                flags |= 4;
            } else {
                activeTanks++;
            }
            var sensor_state = 0;
            for (var j = 0; j < tanks[i].sensors.length; j++) {
                if (tanks[i].sensors[j].triggered) {
                    sensor_state |= (1 << j);
                }
            }
            drawingTanks[i].set_state(tanks[i].position[0], tanks[i].position[1], tanks[i].angle, tanks[i].turret.current, flags, sensor_state);
        }

        if (activeTanks < 2) {
            // we're done
            clearInterval(interval);
            interval = null;
        }

        for (var i = 0; i < tanks.length; i++) {
            drawingTanks[i].draw_crater();
        }

        for (var i = 0; i < tanks.length; i++) {
            drawingTanks[i].draw_wrap_sensors();
        }

        for (var i = 0; i < tanks.length; i++) {
            drawingTanks[i].draw_tank();
        }

	for (var i = 0; i < obstacles.length; i++) {
	    obstacles[i].draw();
	}
    }

    interval = setInterval(update, 100 /*66*/);
};

var rhinoTanks = function(player) {

    tanks = [];
    objs = [];
    obstacles = [];
    us = null;
    var tank;

    rhinout("Starting");
    // add the user tanks

	for (var idx = 0; idx < player.length; idx++) {

		var progdir = player[idx];

		/* color */
		tank = new ForfTank();
		tank.color = readFile(progdir + "/color");
		tank.name = readFile(progdir + "/name");
		tank.progdir = progdir;
		tank.path = progdir;


		/* sensors */
		for (var i = 0; i < TANK_MAX_SENSORS; i++) {
			var sensorpath = (progdir + "/sensor" + i);
			var sensorfile = readFile(sensorpath);
			var sensorbits = sensorfile.split(" ");
			var range = parseInt(sensorbits[0]); 
			var angle = parseInt(sensorbits[1]) % 360; 
			var width = parseInt(sensorbits[2]) % 360; 
			var turret = parseInt(sensorbits[3]); 

			if (range >= 0) {

				tank.addSensor(range, angle, width, turret);
				rhinout("sensor: " + i + " range: " + range + " angle: " + angle + " width: " + width + " turret: " + turret);
			
			}
		}

		var progpath = (progdir + "/program");
		var code = readFile(progpath); 
		if (TANK_MAX_PROGRAM_LENGTH > 0) {
			code = truncateProgram(code, TANK_MAX_PROGRAM_LENGTH);
		}
		tank.init(code);
		tanks.push(tank);
		objs.push(tank);

	}

	n = 1 + Math.floor(Math.random()*3);
    	for (var i = 0; i < n; i++) {
       	    raisePillar();
    	}
	rhinout("Num pillars: " + obstacles.length);
    initBoard();
	for (var i = 0; i < objs.length; i++)
	    objs[i].initObj(null, null);

	/* set up some "constants" for the JSONDATA structure */
	var GAMEDIM = 0;
	var TANKS = 1;
    var PILLARS = 2;
	var FRAMES = 3;
	var TANKSENSORS = 1;
	var JSONDATA = [];

	/* add the field dimension */
	JSONDATA.push([gameSize[0], gameSize[1]]);
	
	/* add an empty list that we'll push tank color and sensors into */
	JSONDATA.push([]); // TANKS 

	/* go through tanks and add each tank's properties to JSONDATA */
	for (var i = 0; i < tanks.length; i++) {

		var jsontank = [];
		jsontank.push(tanks[i].color);
		jsontank.push([]); // array for sensor arrays
		var sensarray = []
		rhinout("tank: " + i);
		for (var s = 0; s < TANK_MAX_SENSORS; s++) {
			rhinout("sensor: " + s);
			if (tanks[i].sensors.length > 0) {
				
				var thissens = [Number(tanks[i].sensors[s].range),
								Number(tanks[i].sensors[s].angle.toPrecision(3)),
								Number(tanks[i].sensors[s].width.toPrecision(3)),
								Number(tanks[i].sensors[s].turret)];
				if ((thissens[0] + thissens[1] + thissens[2] + thissens[3]) == 0) {
					var thissens = 0;
				}
			} else {
				var thissens = 0;
			}
			jsontank[TANKSENSORS].push(thissens);
		}
		JSONDATA[TANKS].push(jsontank);
	}


	JSONDATA.push([]); // PILLARS

	for (var i = 0; i < obstacles.length; i++) {
	    var pillar = [];
	    pillar.push(obstacles[i].position[0]);
	    pillar.push(obstacles[i].position[1]);
	    pillar.push(obstacles[i].radius);
	    JSONDATA[PILLARS].push(pillar);
	}

	JSONDATA.push([]); // BATTLE FRAMES

    function update() {

        updateTanks(tanks, "rhino");

        var activeTanks = 0;

		/* create empty list for this "frame" */
		var curframe = [];

        for (var i = 0; i < tanks.length; i++) {

            /* updating tank tanks[i] for this frame */

	    var flags = 0;
            if (tanks[i].turret.firing) {
                flags |= 1;
            }
            if (tanks[i].led) {
                flags |= 2;
            }
	    if (tanks[i].teleporting) {
		flags |= 8;
	    }
            if (tanks[i].killer) {
                flags |= 4;
            } else {
                activeTanks++;
            }
            var sensor_state = 0;
            for (var j = 0; j < tanks[i].sensors.length; j++) {
                if (tanks[i].sensors[j].triggered) {
                    sensor_state |= (1 << j);
                }
            }

	    /* update the JSON data for this tank/frame */

	    var thistank = [Math.round(tanks[i].position[0]), 
			    Math.round(tanks[i].position[1]), 
			    tanks[i].angle.toPrecision(3), 
			    tanks[i].turret.current.toPrecision(3),
			    flags,
			    sensor_state
			   ];


	    curframe.push(thistank);
        
	}

	JSONDATA[FRAMES].push(curframe);

        if (activeTanks < 2) {
            // we're done
	    return -1
        }

	return 0;
    }

	/* run all rounds and keep count of them */
	var round = 0;
	while (update() == 0 && round <= 500) {
		round++;
	}

	/* extract the standings data from the tank objects */
	var standings = [];

	for (var i = 0; i < tanks.length; i++) {

		var killer = "(nil)";

		if (tanks[i].killer) {
			killer = tanks[i].killer;
		}

		var s = tanks[i].tankid + "\t"	+ tanks[i].path + "\t" + tanks[i].cause_death + "\t" + killer + "\t" + tanks[i].error_pos + "\t" + tanks[i].error;

		standings.push(s);
	}

	return [JSONDATA, standings];
};

/** TEST CODE */

var TEST_BOARD_SIZE = [400, 400];

var testSensors = [
  { range: 50, angle: 0, width: 7, turret: 1 },
];

var testCode = 
  "";

var createTestObjs = function() {
  var tank = new ForfTank();
  for (var i = 0; i < testSensors.length; i++) {
    tank.addSensor(testSensors[i].range, testSensors[i].angle, testSensors[i].width, testSensors[i].turret);
  }
  tank.init(testCode);
  tank.position[0] = 105;
  tank.position[1] = 135;
  tank.angle = 3.14;
  tanks.push(tank);
  objs.push(tank);
  us = tank;

  var pillar = new Pillar(ctx, 25, "#FF0000");
  pillar.position[0] = 100;
  pillar.position[1] = 100;
  obstacles.push(pillar);
  objs.push(pillar);
};

var initTestBoard = function() {
  var nobjects = objs.length;

  gameSize[0] = TEST_BOARD_SIZE[0];
  gameSize[1] = TEST_BOARD_SIZE[1];

  var canvas = document.getElementById('battlefield');
  canvas.width = gameSize[0];
  canvas.height = gameSize[1];  
};

var resetTest = function() {
  if (interval) {
    clearInterval(interval);
  }

  document.getElementById('debug').innerHTML = "&nbsp;";

  objs = [];
  tanks = [];
  drawingTanks = [];
  obstacles = [];
  us = null;
  var tank;

  createTestObjs();
  initTestBoard();

  var canvas = document.getElementById('battlefield');
  var ctx = canvas.getContext('2d'); 

    for (var i = 0; i < tanks.length; i++) {
        var sensors = [];
        for (var j = 0; j < tanks[i].sensors.length; j++) {
            var s = tanks[i].sensors[j];
            var sensor = [s.range, s.angle, s.width, s.turret];
            sensors.push(sensor);
        }
        tank = new Tank(ctx, canvas.width, canvas.height, tanks[i].color, sensors);
        drawingTanks.push(tank);
    }

  for (var i = 0; i < objs.length; i++)
    objs[i].initObj(canvas, ctx);

    function update() {
        updateTanks(tanks, "browser");

        // clear
        canvas.width = canvas.width;

        var activeTanks = 0;
        for (var i = 0; i < tanks.length; i++) {
            var flags = 0;
            if (tanks[i].turret.firing) {
                flags |= 1;
            }
            if (tanks[i].led) {
                flags |= 2;
            }
            if (tanks[i].teleporting) {
                flags |= 8;
            }
            if (tanks[i].killer) {
                flags |= 4;
            } else {
                activeTanks++;
            }
            var sensor_state = 0;
            for (var j = 0; j < tanks[i].sensors.length; j++) {
                if (tanks[i].sensors[j].triggered) {
                    sensor_state |= (1 << j);
                }
            }
            drawingTanks[i].set_state(tanks[i].position[0], tanks[i].position[1], tanks[i].angle, tanks[i].turret.current, flags, sensor_state);
        }


        for (var i = 0; i < tanks.length; i++) {
            drawingTanks[i].draw_crater();
        }

        for (var i = 0; i < tanks.length; i++) {
            drawingTanks[i].draw_wrap_sensors();
        }

        for (var i = 0; i < tanks.length; i++) {
            drawingTanks[i].draw_tank();
        }

	for (var i = 0; i < obstacles.length; i++) {
	    obstacles[i].draw();
	}
    }

  interval = setInterval(update, 100 /*66*/);
};

