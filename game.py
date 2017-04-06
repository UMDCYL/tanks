from CYLGame import NonGridGame


class TanksGame(NonGridGame):
    def __init__(self, random):
        self.random = random


if __name__ == '__main__':
    from CYLGame import run
    run(TanksGame)
