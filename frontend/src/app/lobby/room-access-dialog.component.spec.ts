import { RoomAccessDialogComponent } from './room-access-dialog.component';

describe('RoomAccessDialogComponent', () => {
  it('normalizes the room name and submits credentials', () => {
    const component = new RoomAccessDialogComponent();
    const submitted = vi.fn();
    component.submitted.subscribe(submitted);
    component.name = '  My   Private Room  ';
    component.password = 'secret';

    component.submit();

    expect(submitted).toHaveBeenCalledWith({
      name: 'My Private Room',
      password: 'secret',
    });
  });

  it('does not submit incomplete or pending forms', () => {
    const component = new RoomAccessDialogComponent();
    const submitted = vi.fn();
    component.submitted.subscribe(submitted);
    component.name = 'ab';
    component.password = '123';
    component.submit();
    component.name = 'Valid Room';
    component.password = 'secret';
    component.pending = true;
    component.submit();

    expect(submitted).not.toHaveBeenCalled();
  });

  it('cannot dismiss while a request is pending', () => {
    const component = new RoomAccessDialogComponent();
    const dismissed = vi.fn();
    component.dismissed.subscribe(dismissed);
    component.open = true;
    component.pending = true;

    component.onEscape();
    expect(dismissed).not.toHaveBeenCalled();

    component.pending = false;
    component.onEscape();
    expect(dismissed).toHaveBeenCalledTimes(1);
  });
});
