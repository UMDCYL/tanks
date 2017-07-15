i = rand % 2
if i is 0 {
	set_speed_left = 100
	set_speed_right = 50
} else {
	set_speed_left = 50
	set_speed_right = 100
}

set_turret = rand % 360

i = rand % 30
if i is 0 {
	fire = 1
}
