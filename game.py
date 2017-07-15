from CYLGame.Game import NonGridGame
from CYLGame.Game import Player
from CYLGame.Game import GameFrame
from CYLGame import GameLanguage
from CYLGame.SensorGame import SensorGame, SensorPlayer
from CYLGame.SensorGame import SensorSanitizers
from CYLGame.SensorGame import rotate_point, rad2deg, deg2rad
import math
import random
# BEDUG
#from sys import stderr as err
# BEDUG

TAU = 2.0 * math.pi;
SEP = "---------------------------------------"

DEBUG = False
def dprint(string):
    if DEBUG:
        print(string)
    
class Tank(SensorPlayer):
    # variables that the player uses to control the tank. We don't
    # want these to persist between turns
    player_actions = [
        "fire",
        "set_speed_left",
        "set_speed_right",
        "set_turret",
        "led"
    ]
    
    def __init__(self, game, prog, sensors, color=None):
    	self.tankid = math.floor(game.random.random() * pow(2,64))
        self.prog = prog
        self.game = game
        self.player_state = {}
        self.debug_vars = []
        self.obj_type = game.OBJ_TYPES["tank"]
        if not color:
            # self.http://www.paulirish.com/2009/random-hex-color-code-snippets/
            self.color = '#'+hex(int((4473924+math.floor(game.random.random()*12303291))))[2:]
        else:
            self.color = color
        self.radius = game.TANK_RADIUS
        for sensor in sensors:
            sensor["angle"] = float(sensor["angle"]) * math.pi / 180.0
            sensor["width"] = float(sensor["width"]) * math.pi / 180.0
        self.sensors = sensors
        self.position = [0.0, 0.0]
        self.next_position = [0.0, 0.0]
        self.angle = 0.0
        self.speed_desired = [0, 0]
        self.speed_current = [0, 0]
        self.turret_current = 0.0
        self.turret_desired = 0.0
        self.turret_firing = 0
        self.turret_recharge = 0
    	self.teleport_recharge = 0
    	self.teleporting = 0
        self.led = 0
        self.killer = None
        self.cause_death = "(null)"
    	self.path = ""
    	self.error = "None"
    	self.error_pos = 0
    	self.name = "Unnamed"
    	self.ammo = game.TANK_AMMO 

    def can_fire(self):
        if self.ammo != 0 and not self.turret_recharge:
            return 1
        else:
            return 0

    def fire_and_collision(self, other, dist_sq, vector):
        if self.killer or other.killer:
            return

        # did they collide?
        if dist_sq < (self.radius + other.radius)**2:
            self.killer = other.tankid
            self.cause_death = "collision"
            other.killer = self.tankid
            other.cause_death = "collision"
            return

        if dist_sq > TanksGame.TANK_CANNON_ADJ2:
            return
        if not self.turret_firing:
            return

        theta = self.angle + self.turret_current
        rotated_point = rotate_point(-theta, vector)
        if rotated_point[0] > 0 and abs(rotated_point[1]) < TanksGame.TANK_RADIUS:
            other.killer = self.tankid
            other.cause_death = "shot"

    def update_turret(self):
        rot_angle = self.turret_desired - self.turret_current
        while rot_angle < 0:
            rot_angle += TAU
        rot_angle = ((math.pi + rot_angle) % TAU) - math.pi
        rot_angle = min(TanksGame.TANK_MAX_TURRET_ROT, rot_angle)
        rot_angle = max(-TanksGame.TANK_MAX_TURRET_ROT, rot_angle)
        self.turret_current = (self.turret_current + rot_angle) % TAU

    def precalc_next_position(self):
        for i in range(2):
            if self.speed_current[i] == self.speed_desired[i]:
                continue
            elif self.speed_current[i] < self.speed_desired[i]:
                self.speed_current[i] = min(self.speed_current[i] + TanksGame.TANK_MAX_ACCEL,
                                            self.speed_desired[i])
            else:
                self.speed_current[i] = max(self.speed_current[i] - TanksGame.TANK_MAX_ACCEL,
                                            self.speed_desired[i])
        
        direction = 1
        # simple case first
        if self.speed_current[0] == self.speed_current[1]:
            movement = self.speed_current[0] * (TanksGame.TANK_TOP_SPEED / 100.0)
            angle = 0
        else:
            """
            pflarr's original comment:
            
               The tank drives around in a circle of radius r, which is some
               offset on a line perpendicular to the tank.  The distance it
               travels around the circle varies with the speed of each tread,
               and is such that each side of the tank moves an equal angle
               around the circle.
             
             Sounds good to me.   pflarr's calculations here are fantastico,
             there's nothing whatsoever to change. */
    
             The first thing Paul's code does is find "friction", which seems
             to be a penalty for having the treads go in opposite directions.
             This probably plays hell with precisely-planned tanks, which I
             find very ha ha.
             """
            friction = TanksGame.TANK_FRICTION * (abs(self.speed_current[0] - self.speed_current[1]) / 200.0)
            v = [0, 0]
            v[0] = self.speed_current[0] * (1 - friction) * (TanksGame.TANK_TOP_SPEED / 100.0)
            v[1] = self.speed_current[1] * (1 - friction) * (TanksGame.TANK_TOP_SPEED / 100.0)
            
            # inside and outside speeds
            if abs(v[0]) > abs(v[1]):
                si = v[1]
                so = v[0]
                direction = 1
            else:
                si = v[0]
                so = v[1]
                direction = -1

            # radius of circle to outside tread
            self.movement_radius = so * (TanksGame.TANK_RADIUS * 2) / (so - si)
            """
            pflarr:
    
               The fraction of the circle traveled is equal to the speed
               of the outer tread over the circumference of the circle:
                   Ft = So/(tau*r)
               The angle traveled is:
                   theta = Ft * tau
               This reduces to a simple
                   theta = So/r
               We multiply it by direction to adjust for the direction of rotation
            """
            theta = so / self.movement_radius * direction

            movement = self.movement_radius * math.tan(theta)
            angle = theta
        
        # now move the tank
        self.angle = (self.angle + angle + TAU) % TAU
        m = [0, 0]
        m[0] = math.cos(self.angle) * movement * direction
        m[1] = math.sin(self.angle) * movement * direction

        self.next_position[0] = (self.position[0] + m[0] + TanksGame.SCREEN_WIDTH) % TanksGame.SCREEN_WIDTH
        self.next_position[1] = (self.position[1] + m[1] + TanksGame.SCREEN_HEIGHT) % TanksGame.SCREEN_HEIGHT

    def move(self):
        self.position[0] = self.next_position[0]
        self.position[1] = self.next_position[1]

    def get_state(self):
        state = dict(self.player_state)
        for i, sensor in enumerate(self.sensors):
            if not sensor["range"]:
                state["sensor_" + str(i)] = 0
            else:
                state["sensor_" + str(i)] = sensor["triggered"]

        for key in self.player_actions:
            state.pop(key, None)

        state["fire_ready"] = self.can_fire()

        # BEDUG
        if getattr(self, "is_human", False):
            dprint(SEP)
            dprint("Turns left: " + str(400 - self.game.turns_left))
            if state.get("sensor_3", None) is None or state.get("sensor_4", None) is None:
                dprint("Not defined")
                dprint(str(len(self.sensors)))
            else:
                if state["sensor_3"] and state["sensor_4"]:
                    dprint("Both")
                else:
                #elif not state["sensor_3"] and not state["sensor_4"]:
                    dprint("Not both")
        # BEDUG

        if TanksGame.TELEPORT_ENABLED:
            if not self.teleport_recharge:
                state["teleport_ready"] = 1
            else:
                state["teleport_ready"] = 0

        state["turret_angle"] = self.turret_current

        return state

    def update_state(self, new_state):
        if new_state.get("fire", 0) == 1 and self.can_fire():
            if self.ammo > 0:
                self.ammo -= 1
            self.turret_firing = True
        else:
            self.turret_firing = False

        if new_state.get("set_speed_left", None) is not None:
            desired_speed = int(new_state["set_speed_left"])
            if desired_speed >= -100 and desired_speed <= 100:
                self.speed_desired[0] = desired_speed
            else:
                program_error("set_speed_left not in valid range [-100, 100]")
        if new_state.get("set_speed_right", None) is not None:
            desired_speed = int(new_state["set_speed_right"])
            if desired_speed >= -100 and desired_speed <= 100:
                self.speed_desired[1] = desired_speed
            else:
                program_error("set_speed_right not in valid range [-100, 100]")

        # BEDUG
        if getattr(self, "is_human", False):
            dprint("Desired: %s, %s" % (str(new_state.get("set_speed_left", "None")), str(new_state.get("set_speed_right", "None"))))
            dprint(SEP)
        # BEDUG

        if new_state.get("set_turret", None) is not None:
            self.turret_desired = float(new_state["set_turret"])*math.pi/180.0

        if new_state.get("led", None) is not None:
            self.led = int(new_state["led"])

    def grab_debug_vars(self):
        v = {
            "speed_left" : self.speed_current[0],
            "speed_right" : self.speed_current[1],
            "speed_desired_left" : self.speed_desired[0],
            "speed_desired_right" : self.speed_desired[1]
        }
        for i, sensor in enumerate(self.sensors):
            v["sensor_" + str(i)] = sensor["triggered"]
        self.debug_vars.append(v)

    def get_debug_vars(self):
        return self.debug_vars

class TanksGame(SensorGame):
    SCREEN_WIDTH = 400
    SCREEN_HEIGHT = 400
    GAME_TITLE = "LP Tanks"

    # Game options
    TELEPORT_ENABLED = False

    # Some in-game constants
    MAX_SENSORS = 10
    TANK_RADIUS = 7.5
    MAX_SENSOR_RANGE = 100
    TANK_CANNON_RECHARGE = 2 # Turns to recharge cannon 
    TANK_ENABLE_TELEPORT = 1
    TANK_TELEPORT_RECHARGE = 60
    TANK_CANNON_RANGE = (MAX_SENSOR_RANGE / 2)
    TANK_MAX_ACCEL = 35
    TANK_MAX_TURRET_ROT = (TAU/8)
    TANK_TOP_SPEED = 7
    TANK_FRICTION = 0.75
    TANK_AMMO = -1 # negative ammo means unlimited
    TANK_MAX_PROGRAM_LENGTH = 0 # positive: limit on non-whitespace chars
								 # 0 or less: no limit 
    # Pillar constants
    PILLAR_MIN_RAD = 25
    PILLAR_MAX_RAD = 35
    PILLAR_TO_WALL = 50

    # Object type constants */
    OBJ_TYPES = {
        "tank": 1,
        "pillar": 2,
        "lava": 4,
        "mud": 8
    }

    # Spacing constants
    spacing = [0]*13
    spacing[1] = 50 # tank to tank
    spacing[2] = 50 # pillar to pillar
    spacing[3] = 10 # tank to pillar
    spacing[4] = 50 # lava to lava
    spacing[5] = 20 # tank to lava
    spacing[6] = 50 # pillar to lava
    spacing[8] = 50 # mud to mud
    spacing[9] = 20 # mud to tank
    spacing[10] = 50 # pillar to mud
    spacing[12] = 50 # mud to lava
    
    # (Sensor range + tank radius)^2
    # If the distance^2 to the center of a tank <= TANK_SENSOR_ADJ2,
    # that tank is within sensor range.
    TANK_SENSOR_ADJ2 = ((MAX_SENSOR_RANGE + TANK_RADIUS) * (MAX_SENSOR_RANGE + TANK_RADIUS))

    TANK_CANNON_ADJ2 = ((TANK_CANNON_RANGE + TANK_RADIUS) * (TANK_CANNON_RANGE + TANK_RADIUS))

    # initial game grid spacing
    SPACING = 160

    MEMORY_SIZE = 10
    num_defaults = 8

    def __init__(self, random):
        self.random = random
        self.turns_left = 400
        self.players = []
        # { name : sanitizer }
        self.SENSOR_PROPS = {
            "range" : SensorSanitizers.san_range,
            "angle" : SensorSanitizers.san_angle,
            "width" : SensorSanitizers.san_width,
            "turret" : SensorSanitizers.san_turret
        }

    @staticmethod
    def get_spacing(type1, type2):
        if type1 == type2:
            return TanksGame.spacing[type1]
        else:
            return TanksGame.spacing[type1 + type1]


    def init_board(self):
        # (x, y, radius, obj_type)
        placed_circles = []

        # BEDUG
        self.players[0].is_human = True
        # BEDUG

        # place tanks
        # randomness doesn't matter
        #self.random.shuffle(self.players)
        i = 0
        while i < len(self.players):
            x = math.floor(self.random.random()*self.SCREEN_WIDTH)
            y = math.floor(self.random.random()*self.SCREEN_HEIGHT)
            overlaps = False
            for circle in placed_circles:
                dist_sq = (circle[0] - x)**2 + (circle[1] - y)**2
                min_dist_sq = (circle[2] + self.TANK_RADIUS + self.get_spacing(self.OBJ_TYPES["tank"], circle[3]))**2
                if dist_sq <= min_dist_sq:
                    overlaps = True
                    break

            if not overlaps:
                self.players[i].position[0] = x
                self.players[i].position[1] = y
                self.players[i].angle = self.random.random()*TAU
                placed_circles.append((x, y, self.TANK_RADIUS, self.OBJ_TYPES["tank"]))
                i += 1
        self.do_sensors()

    def create_new_player(self, prog, options):
        if options:
            sensors = options.get("sensors", [])
            if sensors and len(sensors) > self.MAX_SENSORS:
                program_error("create_new_player(): Up to %d sensors allowed. %d given." % (self.MAX_SENSORS, len(sensors)))
            sanitized_sensors = []
            for sensor in sensors:
                san_sensor = {}
                for key, func in self.SENSOR_PROPS.iteritems():
                    if key not in sensor:
                        program_error("sensor missing %s prop!" % (key))
                    san_sensor[key] = func(sensor[key])
                sanitized_sensors.append(san_sensor)

            color = options.get("color", None)
            san_color = SensorSanitizers.san_color(color)
        else:
            sanitized_sensors = []
            san_color = None
        new_player = Tank(self, prog, sanitized_sensors, san_color)
        self.players.append(new_player)
        return new_player


# BEDUG
#    def init_board(self):
#        assert len(self.players) >= 2
#
#        self.players[0].position[0] = 50
#        self.players[0].position[1] = 50
#        self.players[0].angle = TAU / 4.0
#
#        self.players[1].position[0] = 50
#        self.players[1].position[1] = 70
#        self.players[1].angle = 0.1
#
#        self.do_sensors()
# BEDUG

    def do_turn(self):
        # player programs just executed
        # fire cannons, teleport, check for crashes
        for i, player in enumerate(self.players):
            player.grab_debug_vars()
            if player.killer:
                continue

            if player.teleporting:
                player.position[0] = math.floor(self.random.random() * 
                        self.SCREEN_WIDTH)
                player.position[1] = math.floor(self.random.random() * 
                        self.SCREEN_HEIGHT)
            
            for player2 in self.players[i + 1:]:
                if player2.killer:
                    continue
                dist_sq, vector = self.compute_vector(player, player2)
                player.fire_and_collision(player2, dist_sq, vector)
                vector[0] = -vector[0]
                vector[1] = -vector[1]
                player2.fire_and_collision(player, dist_sq, vector)
 
            player.update_turret()
            player.precalc_next_position()
            # TODO: collision with obstacles

        # recharge cannon, teleport, then move
        for player in self.players:
            if player.killer:
                continue
            if player.turret_recharge:
                player.turret_recharge -= 1
            if player.teleport_recharge:
                player.teleport_recharge -= 1
            if player.turret_firing:
                player.turret_firing = 0
                player.turret_recharge = TanksGame.TANK_CANNON_RECHARGE
            if player.teleporting:
                player.teleporting = 0
                player.teleport_recharge = TanksGame.TANK_TELEPORT_RECHARGE
            player.move()

        self.do_sensors()
        self.turns_left -= 1
        # everything needs to be ready for the player to run there
        # program when this function exits

    def get_frame(self):
        frame = GameFrame()
        for player in self.players:
            if player.killer:
                frame.draw_crater(player.position[0], player.position[1],
                            player.angle,
                            player.color)
            else:
                fire_opacity = 5 - min(TanksGame.TANK_CANNON_RECHARGE - player.turret_recharge,
                                    5)
                frame.draw_tank(player.position[0], player.position[1],
                            player.angle,
                            player.turret_current,
                            fire_opacity,
                            player.led,
                            player.color)
                if player.sensors:
                    frame.draw_sensors(player.position[0], player.position[1],
                                player.angle,
                                player.turret_current,
                                player.color,
                                player.sensors)
        return frame

    def get_debug_vars(self):
        return self.players[0].get_debug_vars()

    def is_running(self):
        active_tanks = 0
        for p in self.players:
            active_tanks += 1

        if active_tanks < 2 or self.turns_left <= 0:
            return False
        else:
            return True

    @staticmethod
    def get_intro():
        return open("intro.md", "r").read()

    @staticmethod
    def default_prog_for_bot(language):
        if language == GameLanguage.LITTLEPY:
            return open("bot.lp", "r").read()


if __name__ == '__main__':
    from CYLGame import run
    run(TanksGame)
