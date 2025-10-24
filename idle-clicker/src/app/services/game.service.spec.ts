import { TestBed } from '@angular/core/testing';
import { GameService } from './game.service';

describe('GameService', () => {
  let service: GameService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(GameService);
    service.reset();
  });

  it('devrait initialiser avec 0 éclat et 1 par clic', () => {
    expect(service.money()).toBe(0);
    expect(service.perClick()).toBe(1);
    expect(service.cps()).toBe(0);
  });

  it('devrait augmenter l’argent lors d’un clic', () => {
    service.click();
    expect(service.money()).toBe(1);
  });

  it('devrait permettre d’acheter un générateur quand assez d’argent', () => {
    // accumulate 15 éclats pour acheter un Mineur
    for (let i = 0; i < 15; i++) service.click();
    const before = service.generators().find((g) => g.id === 'miner')!;
    service.buyGenerator('miner');
    const after = service.generators().find((g) => g.id === 'miner')!;
    expect(after.quantity).toBe(before.quantity + 1);
    expect(service.money()).toBeGreaterThanOrEqual(0);
  });
});
