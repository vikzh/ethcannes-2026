import { AccountDeployed as AccountDeployedEvent } from "../generated/AbstractAccountFactory/AbstractAccountFactory";
import { IsolatedAccount as IsolatedAccountTemplate } from "../generated/templates";
import { Account } from "../generated/schema";

export function handleAccountDeployed(event: AccountDeployedEvent): void {
  const accountId = event.params.account.toHexString();
  let account = Account.load(accountId);
  if (account == null) {
    account = new Account(accountId);
    account.deployedAtBlock = event.block.number;
    account.deployedAtTimestamp = event.block.timestamp;
    account.deployedTxHash = event.transaction.hash;
    account.createdBy = event.params.deployer;
  }

  account.owner = event.params.owner;
  account.policyHook = event.params.policyHook;
  account.updatedAtBlock = event.block.number;
  account.updatedAtTimestamp = event.block.timestamp;
  account.save();

  IsolatedAccountTemplate.create(event.params.account);
}
