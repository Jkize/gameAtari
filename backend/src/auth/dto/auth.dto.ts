import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class GoogleLoginDto {
  @IsString()
  @IsNotEmpty()
  idToken!: string;
}

export class PhantomChallengeDto {
  @IsString()
  @IsNotEmpty()
  publicKey!: string;
}

export class PhantomVerifyDto extends PhantomChallengeDto {
  @IsString()
  @IsNotEmpty()
  message!: string;

  @IsString()
  @IsNotEmpty()
  signature!: string;
}

export class CompleteProfileDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_]{3,20}$/)
  username!: string;
}
